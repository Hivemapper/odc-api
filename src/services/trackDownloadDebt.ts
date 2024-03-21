import { exec, spawn } from 'child_process';
import { FRAMEKM_CLEANUP_SCRIPT, FRAMEKM_ROOT_FOLDER, METADATA_ROOT_FOLDER, PUBLIC_FOLDER } from 'config';
import { getOldestFileDateInDirectory } from 'util/index';
import { Instrumentation } from 'util/instrumentation';
import { DEFAULT_TIME, isTimeSet } from 'util/lock';
import { IService } from '../types';
import { isIntegrityCheckDone } from './integrityCheck';
import { getConfig } from 'sqlite/config';
import { deleteFrameKm, getFirstRecord, getFrameKmsCount } from 'sqlite/framekm';

const HIGHWATER_MARK_GB = 22;

let isAppConnectionRequired = false;
export const isCameraRunningOutOfSpace = () => {
  return isAppConnectionRequired;
};

export const setIsAppConnectionRequired = (
  _isAppConnectionRequired: boolean,
) => {
  isAppConnectionRequired = _isAppConnectionRequired;
};

let firedYellowLightEvent = false;
let firedCleanupEvent = false;
let firedOldFileEvent = false;

export const TrackDownloadDebt: IService = {
  execute: async () => {
    try {
      exec(`du -sb ${PUBLIC_FOLDER}`, async (error, stdout) => {
        if (!error) {
          const total = Number(stdout.split('\t')[0]);
          console.log('FrameKM occupied ' + total + ' bytes');
          Instrumentation.add({
            event: 'DashcamDiskUsage',
            size: Number(total) || 0,
          });

          // App connection is required if user collected a lot of data, it is time to start purging it from dashcam
          if (total && total > (HIGHWATER_MARK_GB - 4) * 1024 * 1024 * 1024) {
            isAppConnectionRequired = true;
            if (!firedYellowLightEvent) {
              firedYellowLightEvent = true;
              Instrumentation.add({
                event: 'DashcamShowedOutOfSpaceWarning',
                size: total,
              });
            }
            if (
              total > HIGHWATER_MARK_GB * 1024 * 1024 * 1024 &&
              isIntegrityCheckDone()
            ) {
              try {
                const countFrameKms = await getFrameKmsCount(false);
                if (countFrameKms > 300) {
                  for (let i = 0; i < 10; i++) {
                    const firstRecord = await getFirstRecord();
                    const firstKmId = firstRecord?.fkm_id;
                    if (Number(firstKmId) > 0) {
                      await deleteFrameKm(firstKmId);
                    }
                  }
                  Instrumentation.add({
                    event: 'DashcamFreeUpSpace',
                    message: JSON.stringify({ total, count: countFrameKms }),
                  });
                }
              } catch (error: unknown) {
                console.log('Error cleaning up FrameKMs', error);
              }
              try {
                const cleanupScript = spawn('sh', [
                  FRAMEKM_CLEANUP_SCRIPT,
                  FRAMEKM_ROOT_FOLDER,
                  METADATA_ROOT_FOLDER,
                  String(HIGHWATER_MARK_GB),
                ]);

                cleanupScript.stdout.on('data', data => {
                  console.log(data.toString());
                });

                cleanupScript.on('error', err => {
                  if (!firedCleanupEvent) {
                    firedCleanupEvent = true;
                    Instrumentation.add({
                      event: 'DashcamRemovedOldFiles',
                      size: total,
                      message: 'Failed executing script',
                    });
                  }
                  console.log('Error executing script: ' + err);
                });

                cleanupScript.on('close', code => {
                  if (!firedCleanupEvent) {
                    firedCleanupEvent = true;
                    Instrumentation.add({
                      event: 'DashcamRemovedOldFiles',
                      size: total,
                      message: 'Successfully executed',
                    });
                  }
                  console.log(`cleanup script exited with code ${code}`);
                });
              } catch (error: unknown) {
                console.log(error);
              }
            }
          } else {
            isAppConnectionRequired = false;
            
            if (!isTimeSet()) {
              console.log('Time is not set yet, will check the oldest file timestamp later');
              return;
            }
            // App connection is also required if user has some very old files that are closed to expiration date
            const oldestFileTs = await getOldestFileDateInDirectory(
              FRAMEKM_ROOT_FOLDER,
            );
            const now = Date.now();
            const diff = now - oldestFileTs;
            console.log(
              'The oldest file date: ' + new Date(oldestFileTs),
              diff,
            );

            const MaxPendingTime = await getConfig('MaxPendingTime');

            const isFileTooOld =
              now > DEFAULT_TIME &&
              oldestFileTs > DEFAULT_TIME &&
              diff > MaxPendingTime - 1000 * 60 * 60 * 24;
            if (isFileTooOld && !firedOldFileEvent) {
              firedOldFileEvent = true;
              Instrumentation.add({
                event: 'DashcamShowedOldFilesWarning',
                size: total,
                message: JSON.stringify({
                  diff,
                  now,
                  oldestFileTs,
                }),
              });
            }
          }
        }
      });
    } catch (e: unknown) {
      console.log(e);
    }
  },
  interval: 219909,
};
