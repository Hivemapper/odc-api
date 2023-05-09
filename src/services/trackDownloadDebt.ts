import { exec, spawn } from 'child_process';
import {
  FRAMEKM_CLEANUP_SCRIPT,
  FRAMEKM_ROOT_FOLDER,
  METADATA_ROOT_FOLDER,
} from 'config';
import { IService } from '../types';
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
      exec(`du -sb ${FRAMEKM_ROOT_FOLDER}`, (error, stdout) => {
        if (!error) {
          const total = Number(stdout.split('\t')[0]);
          console.log('FrameKM occupied ' + total + ' bytes');
          if (total && total > (HIGHWATER_MARK_GB - 1) * 1024 * 1024 * 1024) {
            isAppConnectionRequired = true;
            if (total > HIGHWATER_MARK_GB * 1024 * 1024 * 1024) {
              try {
                const cleanupScript = spawn(FRAMEKM_CLEANUP_SCRIPT, [
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
            isAppConnectionRequired = false;
          }
        }
      });
    } catch (e: unknown) {
      console.log(e);
    }
  },
  interval: 300111,
};
