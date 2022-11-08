import { exec, execSync } from 'child_process';
import { appendFile, writeFile } from 'fs';
import {
  ICronConditionMethod,
  ICronJob,
  ICronJobCondition,
  ICronJobConfig,
} from 'types';
export const CRON_CONFIG = '/mnt/data/cron_config';
const CRON_EXECUTED_TASKS_PATH = '/mnt/data/cron_executed';

let currentCronJobs: ICronJob[] = [];
let schedulerIsUpdating = false;

export const scheduleCronJobs = (cronJobsConfig: ICronJobConfig[]) => {
  if (Array.isArray(cronJobsConfig)) {
    if (!cronJobsConfig.length || schedulerIsUpdating) {
      return;
    }
    schedulerIsUpdating = true;

    // We have an array of already executed jobs, currentCronJobs
    // Let's stop jobs that are not included in the new config
    // And do not touch jobs with the same id — let them run
    try {
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
    } catch (e: unknown) {
      console.log('Error updaring scheduler', e);
    }

    schedulerIsUpdating = false;
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
      if (config.frequency.oncePerDevice) {
        // Check if it was executed on this device already
        const executedOnce = execSync('cat ' + CRON_EXECUTED_TASKS_PATH, {
          encoding: 'utf-8',
        });
        if (executedOnce.indexOf(config.id) !== -1) {
          console.log('Cron ' + config.id + ' was executed already. Ignored');
          return;
        }
      }
      const executor = createCronJobExecutor(config);
      console.log('Cron scheduled: ' + config.id);
      if (config.frequency.interval) {
        interval = setInterval(
          () => executor(interval),
          Number(config.frequency.interval),
        );
      } else if (config.frequency.delay) {
        timeout = setTimeout(executor, Number(config.frequency.delay));
      } else {
        executor();
      }
    },
    stop: () => {
      clearInterval(interval);
      clearTimeout(timeout);
    },
  };
};

export const conditionMatches = (
  stdout: string,
  method: ICronConditionMethod,
  value: string | number,
): boolean => {
  switch (method) {
    case 'contains':
      return stdout.indexOf(value.toString()) !== -1;
    case 'equals':
      // better to ignore type matching here
      return stdout == value;
    case 'greaterThan':
      return Number(stdout.trim()) > Number(value);
    case 'lessThan':
      return Number(stdout.trim()) < Number(value);
    case 'startsWith':
      return stdout.indexOf(value.toString()) === 0;
    default:
      return true;
  }
};

export const resolveCondition = async (
  condition: ICronJobCondition,
  _resolve?: (value: boolean | PromiseLike<boolean>) => void,
): Promise<boolean> => {
  return new Promise(resolve => {
    if (_resolve) {
      resolve = _resolve;
    }
    if (condition.cmd) {
      exec(
        condition.cmd,
        {
          encoding: 'utf-8',
        },
        (error, stdout) => {
          if (
            stdout &&
            conditionMatches(stdout, condition.method, condition.value)
          ) {
            if (condition.and) {
              resolveCondition(condition.and, resolve);
            } else {
              resolve(true);
            }
          } else {
            if (condition.or) {
              resolveCondition(condition.or, resolve);
            } else {
              resolve(false);
            }
          }
        },
      );
    } else {
      return resolve(true);
    }
  });
};

export const createCronJobExecutor = (
  config: ICronJobConfig,
): ((interval?: any) => void) => {
  let isRunning = false;
  const execute = async (interval?: any) => {
    if (isRunning) return;
    isRunning = true;

    try {
      let isValid = true;
      if (config.if) {
        isValid = await resolveCondition(config.if);
      }
      if (isValid) {
        if (config.frequency.executeOnce && interval) {
          clearInterval(interval);
        }
        exec(
          config.cmd,
          {
            encoding: 'utf-8',
          },
          (error, stdout) => {
            console.log('Cron executed: ' + config.id);
            if (config.log) {
              console.log(error || stdout);
            }
            isRunning = false;
            if (config.frequency.oncePerDevice) {
              appendFile(
                CRON_EXECUTED_TASKS_PATH,
                config.id + '\n',
                {
                  encoding: 'utf-8',
                },
                () => {},
              );
            }
          },
        );
      } else {
        isRunning = false;
      }
    } catch (e: unknown) {
      console.log(
        'Failed running command ' + config.cmd + ' for cron ' + config.id,
        e,
      );
      isRunning = false;
    }
  };
  return execute;
};
