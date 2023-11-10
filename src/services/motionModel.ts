import { IService } from '../types';
import {
  createMotionModel,
  selectImages,
  packFrameKm,
  checkFrameKmContinuity,
} from 'util/motionModel';
import { FramesMetadata, GnssMetadata } from 'types/motionModel';
import { promiseWithTimeout, sleep } from 'util/index';
import { ifTimeSet } from 'util/lock';
import { isIntegrityCheckDone } from './integrityCheck';
import { isCarParkedBasedOnImu } from 'util/imu';
import { isPrivateZonesInitialised } from './loadPrivacy';
import { getNextGnss, isGnssEligibleForMotionModel } from 'util/motionModel/gnss';
import { getNextImu } from 'util/motionModel/imu';
import { moveFrames } from 'util/frames';
import { addFramesToFrameKm, clearFrameKmTable, getExistingFramesMetadata, getFrameKmMetadata, getFrameKmName, getFramesCount, isFrameKmComplete } from 'sqlite/framekm';
import { getConfig } from 'util/motionModel/config';
import { UNPROCESSED_FRAMEKM_ROOT_FOLDER } from 'config';
import { join } from 'path';
import { promises } from 'fs';

const ITERATION_DELAY = 10000;
let failuresInARow = 0;
let endTripTrimmed = true;

const execute = async () => {
  try {
    const {
      isTripTrimmingEnabled,
      TrimDistance,
      DX
    } = getConfig();

    if (isTripTrimmingEnabled && !endTripTrimmed) {
      const data = await getFrameKmMetadata();
      const frameKmName = await getFrameKmName();
      // Trim the end of last trip
      const trimmedData = data.slice(0, - Math.round(TrimDistance / DX));
      if (trimmedData.length) {
        await packFrameKm(trimmedData);
      }
      await clearFrameKmTable();
      await promises.rmdir(join(UNPROCESSED_FRAMEKM_ROOT_FOLDER, frameKmName), { recursive: true });
      endTripTrimmed = true;
    }

    // Do not iterate if system time is not set
    // wait for system integrity check to be done
    // and Private Zones are in memory
    if (!ifTimeSet() || !isIntegrityCheckDone() || !isPrivateZonesInitialised()) {
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
          const existingKeyFrames = await getExistingFramesMetadata();
          await checkFrameKmContinuity(existingKeyFrames, gnss[0]);
          const chunks = createMotionModel(gnss, imu, existingKeyFrames);
          for (const chunk of chunks) {
            const frameKms = await promiseWithTimeout(
              selectImages(chunk),
              10000,
            );
            
            for (let i = 0; i < frameKms.length; i++) {
              const frameKm = frameKms[i];
              if (frameKm.metadata.length) {
                // update FrameKM table
                await addFramesToFrameKm(frameKm);
                const frameKmName = await getFrameKmName();
                // Move frames to EMMC. TODO: make sure they will never stuck on EMMC if packaging failed
                await moveFrames(frameKm.map(img => img.name || ''), join(UNPROCESSED_FRAMEKM_ROOT_FOLDER, frameKmName));

                // If Current FrameKM is fully complete,
                // Or if there was a cut of frameKM during last iteration
                if (await isFrameKmComplete() || i < frameKms.length - 1) {
                  try {
                    await packFrameKm(await getFrameKmMetadata());
                    await clearFrameKmTable();
                    const count = await getFramesCount();
                    if (count) {
                      // If there are frames left in the table, move them to the new FrameKM folder
                      const newFrameKmName = await getFrameKmName();
                      const remainingFrames = await getFrameKmMetadata();
                      await moveFrames(remainingFrames.map(img => img.name || ''), join(UNPROCESSED_FRAMEKM_ROOT_FOLDER, newFrameKmName), join(UNPROCESSED_FRAMEKM_ROOT_FOLDER, frameKmName));
                    }
                    await promises.rmdir(join(UNPROCESSED_FRAMEKM_ROOT_FOLDER, frameKmName), { recursive: true });
                    failuresInARow = 0;
                  } catch (e) {
                    console.error(e);
                    failuresInARow++;
                    // TODO: dirty cleanup. Make a proper instrumentation and error handling
                    if (failuresInARow > 5) {
                      await clearFrameKmTable();
                      await promises.rmdir(join(UNPROCESSED_FRAMEKM_ROOT_FOLDER, frameKmName), { recursive: true });
                    }
                  }
                } else {
                  console.log('FRAMEKM IS NOT COMPLETE, KEEP MOVING');
                }
              }
            }
          }
        }
      }
    }

    await sleep(ITERATION_DELAY);
    execute();
  } catch (e: unknown) {
    console.log('Iteration error', e);
    await sleep(ITERATION_DELAY);
    execute();
  }
};

export const MotionModelService: IService = {
  execute,
};
