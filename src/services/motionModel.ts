import { IService } from '../types';
import {
  createMotionModel,
  selectImages,
  packFrameKm,
  checkFrameKmContinuity,
} from 'util/motionModel';
import { FramesMetadata, GnssMetadata } from 'types/motionModel';
import { clearDirectory, promiseWithTimeout, sleep } from 'util/index';
import { ifTimeSet } from 'util/lock';
import { isIntegrityCheckDone } from './integrityCheck';
import { isCarParkedBasedOnImu } from 'util/imu';
import { isPrivateZonesInitialised } from './loadPrivacy';
import { getNextGnss, isGnssEligibleForMotionModel } from 'util/motionModel/gnss';
import { getNextImu } from 'util/motionModel/imu';
import { moveFrames } from 'util/frames';
import { addFramesToFrameKm, clearFrameKmTable, getExistingFramesMetadata, getFrameKmMetadata, getFrameKmName, getFramesCount, isFrameKmComplete, isInProgress } from 'sqlite/framekm';
import { UNPROCESSED_FRAMEKM_ROOT_FOLDER } from 'config';
import { join } from 'path';
import { existsSync, promises } from 'fs';

const ITERATION_DELAY = 10000;
let failuresInARow = 0;
let firstLoad = true;

const execute = async () => {
  try {
    if (firstLoad) {
      firstLoad = false;
      await sleep(3000);
      if (!existsSync(UNPROCESSED_FRAMEKM_ROOT_FOLDER)) {
        try {
          await promises.mkdir(UNPROCESSED_FRAMEKM_ROOT_FOLDER);
        } catch (e: unknown) {
          console.log(e);
        }
      }
      if (await isInProgress()) {
        const frameKmName = await getFrameKmName();
        if (frameKmName) {
          try {
            const data = await getFrameKmMetadata(true);
            // Trim the end of last trip
            const trimmedData = data.slice(0, -12);
            if (trimmedData.length) {
              await packFrameKm(frameKmName, trimmedData);
              await clearFrameKmTable(true);
              await clearDirectory(UNPROCESSED_FRAMEKM_ROOT_FOLDER);
            }
          } catch (e) {
            console.error(e);
          }
        }
      }
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
            const frameKms: FramesMetadata[][] = await promiseWithTimeout(
              selectImages(chunk),
              10000,
            );
            
            console.log('FRAMEKMS READY: ' + frameKms.length);
            for (let i = 0; i < frameKms.length; i++) {
              const frameKm = frameKms[i];
              if (frameKm.length) {
                // update FrameKM table
                await addFramesToFrameKm(frameKm);
                const frameKmName = await getFrameKmName();
                console.log('NAME: ', frameKmName);
                if (!frameKmName) {
                  console.log('EMPTY NAME');
                  await sleep(ITERATION_DELAY);
                  execute();
                  return;
                }
                // Move frames to EMMC. TODO: make sure they will never stuck on EMMC if packaging failed
                await moveFrames(frameKm.map(img => img.name || ''), join(UNPROCESSED_FRAMEKM_ROOT_FOLDER, frameKmName));

                // If Current FrameKM is fully complete,
                // Or if there was a cut of frameKM during last iteration
                if (await isFrameKmComplete() || i < frameKms.length - 1) {
                  try {
                    await packFrameKm(frameKmName, await getFrameKmMetadata());
                    console.log('Clearing table');
                    await clearFrameKmTable();
                    const count = await getFramesCount();
                    console.log('After clear: ', count);
                    if (count) {
                      // If there are frames left in the table, move them to the new FrameKM
                      const newFrameKmName = await getFrameKmName();
                      const remainingFrames = await getFrameKmMetadata();
                      await moveFrames(remainingFrames.map(img => img.name || ''), join(UNPROCESSED_FRAMEKM_ROOT_FOLDER, newFrameKmName), join(UNPROCESSED_FRAMEKM_ROOT_FOLDER, frameKmName));
                    }
                    console.log('Removing dir: ', join(UNPROCESSED_FRAMEKM_ROOT_FOLDER, frameKmName));
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
