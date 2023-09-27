import { readFile, write, writeFile } from 'fs';
import { CameraType, IService } from '../types';
import { fileExists } from 'util/index';
import { scheduleCronJobs } from 'util/cron';
import { exec } from 'child_process';
import { CAMERA_TYPE, CRON_CONFIG, CRON_EXECUTED_TASKS_PATH, UNPROCESSED_FRAMEKM_ROOT_FOLDER } from 'config';
import { jsonrepair } from 'jsonrepair';

export const InitCronService: IService = {
  execute: async () => {
    const exists = await fileExists(CRON_CONFIG);
    exec('touch ' + CRON_EXECUTED_TASKS_PATH);
    if (exists) {
      try {
        readFile(CRON_CONFIG, (err, data) => {
          if (err) throw err;
          try {
            let fileContents = '[]';
            const output = data.toString();
            if (output) {
              try {
                fileContents = jsonrepair(output);
              } catch (err: unknown) {
                console.log(err);
              }
            }
            const cronJobs = JSON.parse(fileContents);
            if (Array.isArray(cronJobs)) {
              if (CAMERA_TYPE === CameraType.Hdc) {
                let isAdded = cronJobs.some(
                  (job: any) => job?.id === 'cleanup_old_img_cache_once',
                );
                if (!isAdded) {
                  cronJobs.push({
                    cmd: 'rm -r /mnt/data/pic',
                    frequency: {
                      oncePerDevice: true,
                      delay: 300000,
                    },
                    id: 'cleanup_old_img_cache_once',
                    log: true,
                  });
                }
                isAdded = cronJobs.some(
                  (job: any) => job?.id === 'cleanup_unprocessed_framekm',
                );
                if (!isAdded) {
                  cronJobs.push({
                    cmd: `rm -r ${UNPROCESSED_FRAMEKM_ROOT_FOLDER}/*`,
                    frequency: {
                      oncePerDevice: true,
                      delay: 1000,
                    },
                    id: 'cleanup_unprocessed_framekm',
                    log: true,
                  });
                }
                isAdded = cronJobs.some(
                  (job: any) => job?.id === 'cleanup_unprocessed_framekm_garbage',
                );
                if (!isAdded) {
                  cronJobs.push({
                    cmd: `rm -r ${UNPROCESSED_FRAMEKM_ROOT_FOLDER}/_*`,
                    frequency: {
                      delay: 5000,
                    },
                    id: 'cleanup_unprocessed_framekm_garbage',
                    log: true,
                  });
                }
              }
              scheduleCronJobs(cronJobs);
            }
          } catch (e: unknown) {
            console.log('Error parsing cron config', e);
          }
        });
      } catch (e: unknown) {
        console.log('Error initiating cron config', e);
      }
    }
  },
  delay: 2000,
};
