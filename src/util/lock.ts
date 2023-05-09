import { exec, ExecException } from 'child_process';
import { CMD } from 'config';

let lockTime = 0;
const msss = 0;
const gnssIds: number[] = [];
let isTimeSet = false;
let isCameraTimeInProgress = false;
export const DEFAULT_TIME = 1672000000000;

export const ifTimeSet = () => {
  return isTimeSet || Date.now() > DEFAULT_TIME;
};

export const setLockTime = (ttff: number) => {
  if (!lockTime) {
    lockTime = ttff;
  }
};

export const setSystemTime = (
  timeToSetMs: number,
  now: number,
  successCallback: () => void,
) => {
  console.log('Setting time...');

  exec('timedatectl set-ntp 0', () => {
    setTimeout(() => {
      // DelayDiff is very important - if operation of setting the time takes time itself,
      // we need to take this delay into account
      // const delayDiff = Date.now() - now;
      // const finalDate = new Date(timeToSetMs + delayDiff);
      const finalDate = new Date(timeToSetMs);
      const timeToSet = finalDate
        .toISOString()
        .replace(/T/, ' ')
        .replace(/\..+/, '')
        .split(' ');

      exec(`timedatectl set-time '${timeToSet[0]} ${timeToSet[1]}'`, () => {
        console.log(`timedatectl set-time '${timeToSet[0]} ${timeToSet[1]}'`);
        // 60000ms is a sanity check, of course the diff should be much smaller
        // but if now the diff with time is smaller than a minute, meaning we're for sure switched from Jan 18
        setTimeout(() => {
          if (Math.abs(Date.now() - timeToSetMs) < 60000) {
            console.log('Successfully set');
            successCallback();
          } else {
            console.log('Not set... Retrying.');
            setSystemTime(timeToSetMs, now, successCallback);
          }
        }, 1000);
      });
    }, 1000);
  });
};

export const setCameraTime = () => {
  console.log('Trying to set camera time');
  if (!isCameraTimeInProgress && !isTimeSet) {
    isCameraTimeInProgress = true;

    console.log('Setting camera time...');
    try {
      exec(
        'ubxtool -p NAV-PVT | grep time',
        {
          encoding: 'utf-8',
        },
        (error: ExecException | null, stdout: string) => {
          const output = error ? '' : stdout;
          const elems = output.split(' ');
          let validHex = elems.pop();
          const respTime = Date.now();
          if (validHex && validHex.indexOf('x') === 0) {
            validHex = validHex.slice(1);
            const timeDateBytes = parseInt(validHex, 16)
              .toString(2)
              .padStart(4, '0')
              .slice(-4);
            if (timeDateBytes === '1111' || timeDateBytes === '0111') {
              elems.pop();
              const time = elems.pop();
              let date = elems.pop();
              if (date) {
                date = date.replace(/\//g, '-');
              }
              if (time && date && !isTimeSet) {
                try {
                  const d = date.split('-').map(Number);
                  const t = time.split(':').map(Number);
                  const currentMs = Date.UTC(
                    d[0],
                    d[1] - 1,
                    d[2],
                    t[0],
                    t[1],
                    t[2],
                  );

                  setSystemTime(currentMs, respTime, () => {
                    isCameraTimeInProgress = false;
                    isTimeSet = true;

                    // Here you can check the delta between last gps timestamp record
                    // and system time

                    exec(CMD.STOP_CAMERA, () => {
                      setTimeout(() => {
                        exec(
                          CMD.START_CAMERA,
                          (error: ExecException | null) => {
                            if (!error) {
                              console.log('Camera restarted');
                            } else {
                              exec(CMD.START_CAMERA);
                              console.log(
                                'Camera restarted after second attempt.',
                              );
                            }
                          },
                        );
                      }, 2000);
                    });
                  });
                } catch (e: unknown) {
                  isCameraTimeInProgress = false;
                  console.log(e);
                }
              } else {
                isCameraTimeInProgress = false;
              }
            } else {
              isCameraTimeInProgress = false;
            }
          } else {
            isCameraTimeInProgress = false;
          }
        },
      );
    } catch (e: unknown) {
      isCameraTimeInProgress = false;
    }
    isCameraTimeInProgress = false;
  }
};

export const getLockTime = () => {
  return ifTimeSet()
    ? {
        lockTime,
        msss,
        gnssId: gnssIds.join(' '),
      }
    : {
        lockTime: 0,
        msss: 0,
        gnssIds: [],
      };
};
