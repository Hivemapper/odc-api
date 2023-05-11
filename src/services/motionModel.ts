import { IService } from '../types';
import {
  createMotionModel,
  getNextGnss,
  getNextImu,
  isCarParkedBasedOnImu,
  isGnssEligibleForMotionModel,
  packMetadata,
  selectImages,
  syncCursors,
  MAX_FAILED_ITERATIONS,
} from 'util/motionModel';
import { FramesMetadata, GnssMetadata } from 'types/motionModel';
import { promiseWithTimeout, sleep } from 'util/index';
import { concatFrames } from 'util/framekm';
import { rmSync } from 'fs';
import { MOTION_MODEL_CURSOR } from 'config';
import { ifTimeSet } from 'util/lock';
import { isIntegrityCheckDone } from './integrityCheck';
const ITERATION_DELAY = 5400;

export const lastProcessed = null;
let failedIterations = 0;

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
                  const bytesMap = await promiseWithTimeout(
                    concatFrames(
                      frameKm.metadata.map(
                        (item: FramesMetadata) => item.name || '',
                      ),
                      frameKm.chunkName,
                    ),
                    15000,
                  );
                  if (bytesMap && Object.keys(bytesMap).length) {
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
                } catch (e: unknown) {
                  console.log(e);
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
    console.log('Should repair');
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

export const MotionModelServise: IService = {
  execute,
};
