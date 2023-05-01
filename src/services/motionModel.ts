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
const ITERATION_DELAY = 5100;

export const lastProcessed = null;

let failedIterations = 0;

const execute = async () => {
  try {
    if (!ifTimeSet()) {
      console.log('Ignoring motion model iteration, time is not set yet.');
      await sleep(ITERATION_DELAY);
      execute();
      return;
    }
    console.log('Motion model: Iterating');
    const gnssChunks: GnssMetadata[][] = await getNextGnss();
    console.log('GPS chunks:', gnssChunks.length);
    for (const gnss of gnssChunks) {
      if (isGnssEligibleForMotionModel(gnss)) {
        const imu = await getNextImu(gnss);
        if (!isCarParkedBasedOnImu(imu)) {
          console.log('Creating a motion model');
          const points = createMotionModel(gnss, imu);
          console.log(points.length);
          for (const chunk of points) {
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
                  await promiseWithTimeout(
                    packMetadata(
                      frameKm.chunkName,
                      frameKm.metadata,
                      frameKm.images,
                      bytesMap,
                    ),
                    5000,
                  );
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
    await sleep(ITERATION_DELAY);
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
      await sleep(ITERATION_DELAY);
    }
    execute();
  }
};

export const MotionModelServise: IService = {
  execute,
};