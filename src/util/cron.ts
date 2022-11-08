import { execSync } from 'child_process';
import { writeFile } from 'fs';
import { ICronJob, ICronJobConfig } from 'types';
export const CRON_CONFIG = '/mnt/data/cron_config';
const CRON_EXECUTED_TASKS_PATH = '/mnt/data/cron_executed';

let currentCronJobs: ICronJob[] = [];

export const scheduleCronJobs = (cronJobsConfig: ICronJobConfig[]) => {
  if (Array.isArray(cronJobsConfig)) {
    // We have an array of already executed jobs, currentCronJobs
    // Let's stop jobs that are not included in the new config
    // And do not touch jobs with the same id — let them run

    const jobsToKeep: ICronJob[] = [];
    const jobsToStop: ICronJob[] = [];
    for (const job of currentCronJobs) {
      if (
        cronJobsConfig.some(
          (config: ICronJobConfig) => config.id === job.config.id,
        )
      ) {
        jobsToKeep.push(job);
      } else {
        jobsToStop.push(job);
      }
    }

    // stop the jobs that are not needed anymore
    for (const job of jobsToStop) {
      job.stop();
    }
    currentCronJobs = jobsToKeep;

    // create new cron jobs
    for (const cronJobConf of cronJobsConfig) {
      if (
        !currentCronJobs.some(
          (job: ICronJob) => cronJobConf.id === job.config.id,
        )
      ) {
        const job = createCronJob(cronJobConf);
        job.start();
        currentCronJobs.push(job);
      }
    }
    writeFile(
      CRON_CONFIG,
      JSON.stringify(cronJobsConfig),
      {
        encoding: 'utf-8',
      },
      () => {},
    );
  } else {
    console.log('Wrong format of cronConfig: it should be an array of jobs');
  }
};

export const createCronJob = (config: ICronJobConfig) => {
  let interval: any;
  let timeout: any;

  return {
    config,
    start: () => {
      const executor = createCronJobExecutor(config);
      if (config.frequency.oncePerDevice) {
        // Check if it was executed on this device already
        const executedOnce = execSync('cat ' + CRON_EXECUTED_TASKS_PATH, {
          encoding: 'utf-8',
        });
        if (executedOnce.indexOf(config.id) !== -1) {
          return;
        }
      }
      if (config.frequency.interval) {
        interval = setInterval(
          () => executor(interval),
          Number(config.frequency.interval),
        );
      } else if (config.frequency.delay) {
        timeout = setTimeout(executor, Number(config.frequency.delay));
      }
    },
    stop: () => {
      clearInterval(interval);
      clearTimeout(timeout);
    },
  };
};

export const createCronJobExecutor = (
  config: ICronJobConfig,
): ((interval?: any) => void) => {
  return () => {};
};
