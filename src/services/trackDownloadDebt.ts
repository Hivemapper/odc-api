import { exec, spawn } from 'child_process';
import {
  FRAMEKM_CLEANUP_SCRIPT,
  FRAMEKM_ROOT_FOLDER,
  METADATA_ROOT_FOLDER,
} from 'config';
import e from 'express';
import { getOldestFileDateInDirectory } from 'util/index';
import { DEFAULT_TIME } from 'util/lock';
import { getConfig } from 'util/motionModel';
import { IService } from '../types';
import { isIntegrityCheckDone } from './integrityCheck';
const HIGHWATER_MARK_GB = 20;

let isAppConnectionRequired = false;
export const isCameraRunningOutOfSpace = () => {
  return isAppConnectionRequired;
};

export const setIsAppConnectionRequired = (
  _isAppConnectionRequired: boolean,
) => {
  isAppConnectionRequired = _isAppConnectionRequired;
};

export const TrackDownloadDebt: IService = {
  execute: async () => {
    try {
      exec(`du -sb ${FRAMEKM_ROOT_FOLDER}`, async (error, stdout) => {
        if (!error) {
          const total = Number(stdout.split('\t')[0]);
          console.log('FrameKM occupied ' + total + ' bytes');

          // App connection is required if user collected a lot of data, it is time to start purging it from dashcam
          if (total && total > (HIGHWATER_MARK_GB - 1) * 1024 * 1024 * 1024) {
            isAppConnectionRequired = true;
            if (
              total > HIGHWATER_MARK_GB * 1024 * 1024 * 1024 &&
              isIntegrityCheckDone()
            ) {
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
                  console.log('Error executing script: ' + err);
                });

                cleanupScript.on('close', code => {
                  console.log(`cleanup script exited with code ${code}`);
                });
              } catch (error: unknown) {
                console.log(error);
              }
            }
          } else {
            // App connection is also required if user has some very old files that are closed to expiration date
            const oldestFileTs = await getOldestFileDateInDirectory(
              FRAMEKM_ROOT_FOLDER,
            );
            const now = Date.now();
            const diff = now - oldestFileTs;
            isAppConnectionRequired =
              oldestFileTs > DEFAULT_TIME &&
              diff > getConfig().MaxPendingTime - 1000 * 60 * 60 * 24;
          }
        }
      });
    } catch (e: unknown) {
      console.log(e);
    }
  },
  interval: 300111,
};
