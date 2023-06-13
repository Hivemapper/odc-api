import { exec, ExecException } from 'child_process';

export const DEFAULT_TIME = 1672000000000;
let lockTime = 0;
let isTimeSet = false;

export const ifTimeSet = () => {
  if (isTimeSet) {
    return true;
  }
  isTimeSet = Date.now() > DEFAULT_TIME;
  return isTimeSet;
};

export const setLockTime = (ttff: number) => {
  lockTime = ttff;
};

export const getLockTime = () => {
  return {
    lockTime,
  };
};

export const setSystemTime = (
  timeToSetMs: number,
  successCallback: () => void,
  errorCallback: () => void,
  retries = 0
) => {
  console.log('Setting time...');
  if (retries > 3) {
    console.log('Failed setting time');
    return;
  }

  exec('timedatectl set-ntp 0', () => {
    setTimeout(() => {
      const timeToSet = new Date(timeToSetMs)
        .toISOString()
        .replace(/T/, ' ')
        .replace(/\..+/, '')
        .split(' ');

      exec(
        `timedatectl set-time '${timeToSet[0]} ${timeToSet[1]}'`,
        (error: ExecException | null) => {
          console.log(`timedatectl set-time '${timeToSet[0]} ${timeToSet[1]}'`);
          // 60000ms is a sanity check, of course the diff should be much smaller
          // but if now the diff with time is smaller than a minute, meaning we're for sure switched from Jan 18
          if (!error && Math.abs(Date.now() - timeToSetMs) < 60000) {
            console.log('Successfully set');
            successCallback();
          } else {
            console.log('Not set... Retrying.');
            setSystemTime(timeToSetMs, successCallback, errorCallback, retries++);
          }
        },
      );
    }, 2000);
  });
};
