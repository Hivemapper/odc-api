import { IService } from '../types';
import {
  createMotionModel,
  getNextGnss,
  getNextImu,
  isCarParkedBasedOnImu,
  isGnssEligibleForMotionModel,
  selectImages,
  syncCursors,
} from 'util/motionModel';
import { GnssMetadata } from 'types/motionModel';
import { sleep } from 'util/index';
import { concatFrames } from 'util/framekm';
const ITERATION_DELAY = 10000;

export const lastProcessed = null;

const execute = async () => {
  try {
    console.log('Motion model: Iterating');
    const gnssChunks: GnssMetadata[][] = await getNextGnss();
    for (const gnss of gnssChunks) {
      if (isGnssEligibleForMotionModel(gnss)) {
        const imu = await getNextImu(gnss);
        if (!isCarParkedBasedOnImu(imu)) {
          const points = createMotionModel(gnss, imu);
          for (const chunk of points) {
            const frameKms = await selectImages(chunk);
            for (const frameKm of frameKms) {
              await concatFrames([], frameKm.chunkName);
            }
          }
        }
      }
    }
    await syncCursors();
    await sleep(ITERATION_DELAY);
    execute();
  } catch (e: unknown) {
    console.log('Should repair');
    await sleep(ITERATION_DELAY);
    execute();
  }
};

export const MotionModelServise: IService = {
  execute,
};
