import { readFile, write, writeFile } from 'fs';
import { IService } from '../types';
import { fileExists } from 'util/index';
import { scheduleCronJobs } from 'util/cron';
import { exec } from 'child_process';
import { CRON_CONFIG, CRON_EXECUTED_TASKS_PATH } from 'config';

export const InitCronService: IService = {
  execute: async () => {
    const exists = await fileExists(CRON_CONFIG);
    if (exists) {
      try {
        exec('touch ' + CRON_EXECUTED_TASKS_PATH);
        readFile(CRON_CONFIG, (err, data) => {
          if (err) throw err;
          try {
            const cronJobs = JSON.parse(data.toString());
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
