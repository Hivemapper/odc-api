import { exec, ExecException } from 'child_process';
import { TMP_FILE_PATH } from 'config';

let lockTime = 0;
let msss = 0;
let gnssIds: number[] = [];
let isTimeSet = false;
let isCameraTimeInProgress = false;
let isLockTimeInProgress = false;

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
                  exec('timedatectl set-ntp 0', () => {
                    exec(`timedatectl set-time '${date} ${time}'`, () => {
                      isCameraTimeInProgress = false;
                      isTimeSet = true;
                      console.log('System time set to ' + date + ' ' + time);
                      // TODO: Temp solution for restarting the camera to catch the freshest timestamp
                      // Will be fixed outside of ODC API by polling the config and applying that on-the-fly
                      exec('systemctl stop camera-bridge', () => {
                        exec(`touch ${TMP_FILE_PATH}`, () => {
                          exec(
                            `find /mnt/data/pic/ -maxdepth 1 -type f -newer ${TMP_FILE_PATH} -exec rm -rf {} \\;`,
                          );
                          exec('systemctl start camera-bridge');
                          console.log('Camera restarted')
                        });
                      });
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
          isCameraTimeInProgress = false;
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
