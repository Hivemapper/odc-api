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
import { FramesMetadata, GnssMetadata } from 'types/motionModel';
import { sleep } from 'util/index';
import { concatFrames } from 'util/framekm';
const ITERATION_DELAY = 10000;

export const lastProcessed = null;

const execute = async () => {
  try {
    // /mnt/data/gps/2023-04-27T23:28:52.129Z.json
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
            const frameKms = await selectImages(chunk);
            for (const frameKm of frameKms) {
              if (frameKm.metadata.length) {
                console.log(
                  'Ready to pack ' + frameKm.metadata.length + ' frames',
                );
                await concatFrames(
                  frameKm.metadata.map(
                    (item: FramesMetadata) => item.name || '',
                  ),
                  frameKm.chunkName,
                );
              }
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
