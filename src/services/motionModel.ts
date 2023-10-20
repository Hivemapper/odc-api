import { IService } from '../types';
import {
  createMotionModel,
  getNextGnss,
  getNextImu,
  isGnssEligibleForMotionModel,
  packMetadata,
  selectImages,
  syncCursors,
  MAX_FAILED_ITERATIONS,
  getConfig,
} from 'util/motionModel';
import { FrameKMTelemetry, FramesMetadata, GnssMetadata } from 'types/motionModel';
import { promiseWithTimeout, sleep } from 'util/index';
import { concatFrames, getFrameKmTelemetry } from 'util/framekm';
import { existsSync, mkdir, renameSync, rmSync, rmdirSync } from 'fs';
import { FRAMES_ROOT_FOLDER, MOTION_MODEL_CURSOR, UNPROCESSED_FRAMEKM_ROOT_FOLDER } from 'config';
import { ifTimeSet } from 'util/lock';
import { isIntegrityCheckDone } from './integrityCheck';
import { isCarParkedBasedOnImu } from 'util/imu';
import { Instrumentation } from 'util/instrumentation';
import console from 'console';
import { isPrivateZonesInitialised } from './loadPrivacy';
const ITERATION_DELAY = 3400;

export const lastProcessed = null;
let failedIterations = 0;

const execute = async () => {
  let iterationDelay = ITERATION_DELAY;
  try {
    if (!ifTimeSet()) {
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
    if (!isPrivateZonesInitialised()) {
      console.log('Private zones are not initialised yet. Waiting');
      await sleep(iterationDelay);
      execute();
      return;
    }
    console.log('Motion model: Iterating');
    const gnssChunks: GnssMetadata[][] = await getNextGnss();
    console.log('GPS chunks:', gnssChunks.length);
    let bundleName = '';
    let destFolder = '';

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
                  if (!destFolder && getConfig().isDashcamMLEnabled) {
                    bundleName = frameKm.chunkName;
                    destFolder = UNPROCESSED_FRAMEKM_ROOT_FOLDER + '/_' + bundleName + '_bundled';
                    if (existsSync(destFolder)) {
                      rmdirSync(destFolder, { recursive: true });
                    }
                    await new Promise(resolve => {
                      mkdir(destFolder, resolve);
                    });
                  }
                  const start = Date.now();
                  const bytesMap = await promiseWithTimeout(
                    concatFrames(
                      frameKm.metadata.map(
                        (item: FramesMetadata) => item.name || '',
                      ),
                      frameKm.chunkName,
                      0,
                      FRAMES_ROOT_FOLDER,
                      false,
                      destFolder,
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
                  }
                  let framekmTelemetry: FrameKMTelemetry = {
                    systemtime: Date.now()
                  };
                  try {
                    framekmTelemetry = await promiseWithTimeout(getFrameKmTelemetry(frameKm.images[0], gnss[0], imu), 5000);
                  } catch (error: unknown) {
                    console.log('Error getting telemetry', error);
                  }
                  Instrumentation.add({
                    event: 'DashcamPackedFrameKm',
                    size: totalBytes,
                    message: JSON.stringify({
                      name: frameKm.chunkName,
                      numFrames: frameKm.images?.length,
                      duration: Date.now() - start,
                      ...framekmTelemetry,
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
    if (destFolder && (existsSync(destFolder))) {
      /**
       * committing the 30-sec cycle of frames selected
       * Now ML script can start processing the frames
       */
      renameSync(destFolder, UNPROCESSED_FRAMEKM_ROOT_FOLDER + '/' + bundleName + '_bundled');
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
