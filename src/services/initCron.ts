import { readFile } from 'fs';
import { IService } from '../types';
import { fileExists } from 'util/index';
import { CRON_CONFIG, scheduleCronJobs } from 'util/cron';

export const InitCronService: IService = {
  execute: async () => {
    const exists = await fileExists(CRON_CONFIG);
    if (exists) {
      try {
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
  delay: 10000,
};
