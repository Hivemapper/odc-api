import { exec, ExecException } from 'child_process';

let lockTime = 0;
let inProgress = false;
let isTimeSet = false;

export const setLockTime = () => {
  if (!lockTime) {
    try {
      exec('ubxtool -p NAV-STATUS | grep ttff', { encoding: 'utf-8' }, (error: ExecException | null, stdout: string) => {
        const output = error ? '' : stdout;
        const elems = output.split(',');
        if (elems.length && elems[0].indexOf('ttff') !== -1) {
          const ttff = elems[0].split(' ').pop();
          if (ttff) {
            lockTime = Number(ttff);
          }
        }
      })
    } catch (e: unknown) {
      console.log(e);
    }
  }
}

export const setCameraTime = () => {
  if (!inProgress && !isTimeSet) {
    inProgress = true;

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
                        inProgress = false;
                        isTimeSet = true;
                      });
                    });
                  });
                });
              }
            }
          }
          inProgress = false;
        },
      );
    } catch (e: unknown) {
      inProgress = false;
    }
    inProgress = false;
  }
};

export const getLockTime = () => {
  return lockTime;
};
