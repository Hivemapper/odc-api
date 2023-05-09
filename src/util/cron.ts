import { exec, execSync, spawn } from 'child_process';
import { CRON_CONFIG, CRON_EXECUTED_TASKS_PATH } from 'config';
import { appendFile, writeFile } from 'fs';
import {
  ICronConditionMethod,
  ICronJob,
  ICronJobCondition,
  ICronJobConfig,
} from 'types';

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

      const commandsExecutedOncePerDevice = execSync(
        'cat ' + CRON_EXECUTED_TASKS_PATH,
        {
          encoding: 'utf-8',
        },
      );

      // create new cron jobs
      for (const cronJobConf of cronJobsConfig) {
        if (
          !currentCronJobs.some(
            (job: ICronJob) => cronJobConf.id === job.config.id,
          )
        ) {
          if (commandsExecutedOncePerDevice.indexOf(cronJobConf.id) !== -1) {
            console.log(
              'Cron ' + cronJobConf.id + ' was executed already. Ignored',
            );
          } else {
            const job = createCronJob(cronJobConf);
            job.start();
            currentCronJobs.push(job);
          }
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
  log: boolean,
  _resolve?: (value: boolean | PromiseLike<boolean>) => void,
): Promise<boolean> => {
  return new Promise(resolve => {
    if (_resolve) {
      resolve = _resolve;
    }
    if (condition.cmd) {
      try {
        const child = spawn(condition.cmd || '', { shell: true });
        let output = '';
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', data => {
          output += data.toString();
        });
        child.on('close', async code => {
          if (code !== 0) {
            console.log('Failed with code: ', code);
          }
          if (output && log) {
            console.log(condition.cmd);
            console.log(output);
          }
          if (
            output &&
            conditionMatches(output, condition.method, condition.value)
          ) {
            if (condition.and) {
              resolveCondition(condition.and, log, resolve);
            } else {
              resolve(true);
            }
          } else {
            if (condition.or) {
              resolveCondition(condition.or, log, resolve);
            } else {
              resolve(false);
            }
          }
        });
      } catch (e: unknown) {
        console.log('Failed executing command', e);
      }
    } else {
      return resolve(true);
    }
  });
};

export const cacheExecutionForDevice = (id: string) => {
  try {
    appendFile(
      CRON_EXECUTED_TASKS_PATH,
      id + '\n',
      {
        encoding: 'utf-8',
      },
      () => {},
    );
  } catch (e: unknown) {
    console.log('Error appending to cache file', e);
  }
};

export const createCronJobExecutor = (
  config: ICronJobConfig,
): ((interval?: any) => void) => {
  let isRunning = false;

  const executeOneOrMany = (command: string | string[]) => {
    const cmd = Array.isArray(command) ? command.shift() : command;

    if (cmd === 'reboot') {
      cacheExecutionForDevice(config.id);
    }
    try {
      console.log('Command executed: ' + cmd);
      const child = spawn(cmd || '', { shell: true });
      let output = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', data => {
        output += data.toString();
      });
      child.on('error', err => {
        console.log('Error executing command: ' + err);
      });
      child.on('close', async code => {
        console.log('Command finished: ' + cmd);
        if (code !== 0) {
          console.log('Failed with code: ', code);
        }
        if (output && config.log) {
          console.log(output);
        }
        if (config.frequency.oncePerDevice) {
          cacheExecutionForDevice(config.id);
        }
        if (Array.isArray(command) && command.length) {
          executeOneOrMany(command);
        } else {
          isRunning = false;
        }
      });
    } catch (e: unknown) {
      console.log('Failed executing command', e);
    }
  };

  const executor = async (interval?: any) => {
    if (isRunning) return;
    isRunning = true;

    try {
      let isValid = true;
      if (config.if) {
        isValid = await resolveCondition(config.if, config.log);
      }
      if (isValid) {
        if (config.frequency.executeOnce && interval) {
          clearInterval(interval);
        }
        executeOneOrMany(
          Array.isArray(config.cmd) ? [...config.cmd] : config.cmd,
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

  return executor;
};
