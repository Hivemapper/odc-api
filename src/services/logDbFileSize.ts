import { exec } from 'child_process';
import { DB_PATH, TEST_MODE } from 'config';

import { IService } from '../types';
import { Instrumentation } from 'util/instrumentation';
import { resetSensorData } from 'sqlite/common';

export const DB_HIGHWATERMARK = 300 * 1024 * 1024; // 300MB

export const LogDbFileSize: IService = {
  execute: async () => {
    if (TEST_MODE) return;
    
    try {
      exec(`du -b ${DB_PATH}`, (error, stdout) => {
        if (error) {
          console.log(error);
          return;
        }
        const dbFileSize = parseInt(stdout.split('\t')[0]);

        if (dbFileSize > DB_HIGHWATERMARK) {
          resetSensorData();
          Instrumentation.add({
            event: 'DashcamCleanedUpSensorData',
            size: dbFileSize,
          });
        } else {
          Instrumentation.add({
            event: 'DashcamDbFileSize',
            size: dbFileSize,
          });
        }
      });
    } catch (error: unknown) {
      console.log(error);
    }
  },
  interval: 600000, // every 10 minutes
};
