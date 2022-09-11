import { exec, ExecException } from 'child_process';

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
                      gnssIds.push(Number(parts[gnssIndex + 1]));
                    }
                  });
                  lockTime = Number(ttff);
                  isLockTimeInProgress = false;
                },
              );
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
                exec('timedatectl set-ntp 0', () => {
                  exec(`timedatectl set-time ${date}`, () => {
                    exec(`timedatectl set-time ${time}`, () => {
                      // TODO: Temp solution for restarting the camera to catch the freshest timestamp
                      // Will be fixed outside of ODC API by polling the config and applying that on-the-fly
                      exec('systemctl stop camera-bridge', () => {
                        exec('systemctl start camera-bridge');
                        isCameraTimeInProgress = false;
                        isTimeSet = true;
                      });
                    });
                  });
                });
              }
            }
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
