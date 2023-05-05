import { readFile, write, writeFile } from 'fs';
import { CameraType, IService } from '../types';
import { fileExists } from 'util/index';
import { scheduleCronJobs } from 'util/cron';
import { exec } from 'child_process';
import { CAMERA_TYPE, CRON_CONFIG, CRON_EXECUTED_TASKS_PATH } from 'config';
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
            const cronJobs = JSON.parse(jsonrepair(data.toString()));
            if (CAMERA_TYPE === CameraType.Hdc) {
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
            scheduleCronJobs(cronJobs);
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
