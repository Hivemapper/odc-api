import { exec, ExecException } from 'child_process';
import { CMD } from 'config';

let lockTime = 0;
let msss = 0;
let gnssIds: number[] = [];
let isTimeSet = false;
let isCameraTimeInProgress = false;
let isLockTimeInProgress = false;

export const ifTimeSet = () => {
  return isTimeSet;
};

export const setLockTime = () => {
  if (!isLockTimeInProgress && !lockTime) {
    isLockTimeInProgress = true;
    try {
      exec(
        'ubxtool -p NAV-STATUS | grep ttff',
        { encoding: 'utf-8' },
        (error: ExecException | null, stdout: string) => {
          let output = error ? '' : stdout;
          const elems = output.split(',');
          if (elems.length && elems[0].indexOf('ttff') !== -1) {
            const ttff = elems[0].split(' ').pop();
            if (ttff) {
              if (elems[1]) {
                const ms = elems[1].split(' ').pop();
                msss = Number(ms);
              }
              try {
                exec(
                  'ubxtool -p NAV-SIG | grep gnssId',
                  { encoding: 'utf-8' },
                  (error: ExecException | null, stdout: string) => {
                    output = error ? '' : stdout;
                    // collect ssids
                    gnssIds = [];
                    output.split('\n').map(sat => {
                      const parts = sat.split(' ');
                      const gnssIndex = parts.findIndex(
                        elem => elem.indexOf('gnssId') !== -1,
                      );
                      if (gnssIndex !== -1) {
                        const gnssToAdd = Number(parts[gnssIndex + 1]);
                        if (gnssIds.indexOf(gnssToAdd) === -1) {
                          gnssIds.push(gnssToAdd);
                        }
                      }
                    });
                    lockTime = Number(ttff);
                    console.log('Set ttff: ' + ttff);
                    isLockTimeInProgress = false;
                  },
                );
              } catch (e: unknown) {
                isLockTimeInProgress = false;
                console.log(e);
              }
            }
          }
          isLockTimeInProgress = false;
        },
      );
    } catch (e: unknown) {
      isLockTimeInProgress = false;
      console.log(e);
    }
  }
};

const setSystemTime = (
  timeToSetMs: number,
  now: number,
  successCallback: () => void,
) => {
  console.log('Setting time...');

  exec('timedatectl set-ntp 0', () => {
    setTimeout(() => {
      // DelayDiff is very important - if operation of setting the time takes time itself,
      // we need to take this delay into account
      const delayDiff = Date.now() - now;
      const finalDate = new Date(timeToSetMs + delayDiff);
      const timeToSet = finalDate
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
          if (!error && Math.abs(Date.now() - finalDate.getTime()) < 60000) {
            console.log('Successfully set');
            successCallback();
          } else {
            console.log('Not set... Retrying.');
            setSystemTime(timeToSetMs, now, successCallback);
          }
        },
      );
    }, 2000);
  });
};

export const setCameraTime = () => {
  if (!isCameraTimeInProgress && !isTimeSet) {
    isCameraTimeInProgress = true;

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
              const date = elems.pop()?.replace(/\//g, '-');
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
  return {
    lockTime,
    msss,
    gnssId: gnssIds.join(' '),
  };
};
