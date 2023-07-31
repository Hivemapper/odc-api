import { IService } from '../types';
import {
  createMotionModel,
  getNextGnss,
  getNextImu,
  isGnssEligibleForMotionModel,
  packMetadata,
  selectImages,
  syncCursors,
  MAX_FAILED_ITERATIONS, getConfig,
} from 'util/motionModel';
import { FramesMetadata, GnssMetadata } from 'types/motionModel';
import { promiseWithTimeout, sleep } from 'util/index';
import { concatFrames } from 'util/framekm';
import { existsSync, mkdir, rmSync } from 'fs';
import { MOTION_MODEL_CURSOR, RAW_DATA_ROOT_FOLDER } from 'config';
import { ifTimeSet } from 'util/lock';
import { isIntegrityCheckDone } from './integrityCheck';
import { isCarParkedBasedOnImu } from 'util/imu';
import { Instrumentation } from 'util/instrumentation';
import { getRawImuData, writeRawData } from 'util/datalogger';
import console from 'console';
const ITERATION_DELAY = 5400;

export const lastProcessed = null;
let failedIterations = 0;
let lastTimeRawSnippetCreated = Date.now();
const config = getConfig();

const execute = async () => {
  let iterationDelay = ITERATION_DELAY;
  try {
    if (!ifTimeSet()) {
      console.log('Ignoring motion model iteration, time is not set yet.');
      await sleep(iterationDelay);
      execute();
      return;
    }
    if (!isIntegrityCheckDone()) {
      console.log(
        'Integrity check is not done, waiting for the system to be ready',
      );
      await sleep(iterationDelay);
      execute();
      return;
    }
    console.log('Motion model: Iterating');
    const gnssChunks: GnssMetadata[][] = await getNextGnss();
    console.log('GPS chunks:', gnssChunks.length);
    for (const gnss of gnssChunks) {
      if (isGnssEligibleForMotionModel(gnss)) {
        await sleep(3000); // let IMU logger wrap the fresh file
        iterationDelay -= 3000; // make the iteration delay smaller since we already spent some time on waiting for IMU
        const imu = await getNextImu(gnss);
        if (!isCarParkedBasedOnImu(imu)) {
          console.log('Creating a motion model');
          const chunks = createMotionModel(gnss, imu);
          for (const chunk of chunks) {
            const frameKms = await promiseWithTimeout(
              selectImages(chunk),
              10000,
            );
            for (const frameKm of frameKms) {
              if (frameKm.metadata.length) {
                console.log(
                  'Ready to pack ' + frameKm.metadata.length + ' frames',
                );
                try {
                  const start = Date.now();
                  const bytesMap = await promiseWithTimeout(
                    concatFrames(
                      frameKm.metadata.map(
                        (item: FramesMetadata) => item.name || '',
                      ),
                      frameKm.chunkName,
                    ),
                    15000,
                  );
                  let totalBytes = 0;
                  if (bytesMap && Object.keys(bytesMap).length) {
                    totalBytes = (Object.values(bytesMap) as number[]).reduce(
                      (acc: number, curr: number | undefined) =>
                        acc + (Number(curr) || 0),
                      0,
                    );
                    await promiseWithTimeout(
                      packMetadata(
                        frameKm.chunkName,
                        frameKm.metadata,
                        frameKm.images,
                        bytesMap,
                      ),
                      5000,
                    );
                    if (config.rawLogsConfiguration && config.rawLogsConfiguration.isEnabled) {
                      if (!existsSync(RAW_DATA_ROOT_FOLDER)) {
                        try {
                          await new Promise(resolve => {
                            mkdir(RAW_DATA_ROOT_FOLDER, resolve);
                          });
                        } catch (e: unknown) {
                          console.log(e);
                        }
                      }
                      if (lastTimeRawSnippetCreated < Date.now() - (config.rawLogsConfiguration.interval * 1000) || frameKm.images.length > 5) {
                        const from = new Date(frameKm.metadata[0].t).toISOString().replace('T', ' ').replace('Z', '');
                        const to = new Date(frameKm.metadata[frameKm.metadata.length - 1].t).toISOString().replace('T', ' ').replace('Z', '');
                        const name = `${frameKm.chunkName}.db.gz`;
                        const rawData = await getRawImuData(from, to);
                        if (rawData) {
                          await writeRawData(rawData, name);
                        }
                        lastTimeRawSnippetCreated = Date.now();
                      }
                    }
                  }
                  Instrumentation.add({
                    event: 'DashcamPackedFrameKm',
                    size: totalBytes,
                    message: JSON.stringify({
                      name: frameKm.chunkName,
                      numFrames: frameKm.images?.length,
                      duration: Date.now() - start,
                    }),
                  });
                } catch (error: unknown) {
                  Instrumentation.add({
                    event: 'DashcamFailedPackingFrameKm',
                    message: JSON.stringify({
                      name: frameKm.chunkName,
                      reason: 'Motion Model Error',
                      error,
                    }),
                  });
                  console.log(error);
                }
              }
            }
          }
        }
      }
    }
    await syncCursors();
    failedIterations = 0;
    await sleep(iterationDelay);
    execute();
  } catch (e: unknown) {
    console.log('Should repair', e);
    failedIterations++;
    if (failedIterations > 1) {
      if (failedIterations > MAX_FAILED_ITERATIONS) {
        rmSync(MOTION_MODEL_CURSOR);
      } else {
        try {
          await syncCursors();
        } catch (e: unknown) {
          console.log('Problem syncing cursors');
        }
      }
      await sleep(iterationDelay);
    }
    execute();
  }
};

export const MotionModelService: IService = {
  execute,
};
