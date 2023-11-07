import { IService } from '../types';
import {
  createMotionModel,
  selectImages,
  packFrameKm,
} from 'util/motionModel';
import { GnssMetadata } from 'types/motionModel';
import { promiseWithTimeout, sleep } from 'util/index';
import { ifTimeSet } from 'util/lock';
import { isIntegrityCheckDone } from './integrityCheck';
import { isCarParkedBasedOnImu } from 'util/imu';
import { isPrivateZonesInitialised } from './loadPrivacy';
import { getNextGnss, isGnssEligibleForMotionModel } from 'util/motionModel/gnss';
import { getNextImu } from 'util/motionModel/imu';
const ITERATION_DELAY = 10000;

export const lastProcessed = null;

const execute = async () => {
  try {
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
          const chunks = createMotionModel(gnss, imu);
          for (const chunk of chunks) {
            const frameKms = await promiseWithTimeout(
              selectImages(chunk),
              10000,
            );
            for (const frameKm of frameKms) {
              if (frameKm.metadata.length) {
                await packFrameKm(frameKm);
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
