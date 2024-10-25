import { spawn, execSync } from 'child_process';
import { CAMERA_TYPE } from 'config';
import { CameraType } from 'types';

const HDC_ROOT = '/mnt/data/';
const HDCS_ROOT = '/data/';
const MENDER_PATH = HDCS_ROOT + 'core.mender';
const FIP_PATH = HDCS_ROOT + 'fip.bin';

export let message = 'started';
export let errorSeen = false;
export const SUCCESS_MESSAGE = 'Spwan ran successfully';

const runSpawn = (cmd: string) => {
  const child = spawn(cmd, {
    shell: true,
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', data => {
    message = data.toString();
  });

  child.on('error', error => {
    message = 'Error' + error.toString();
    errorSeen = true;
    console.error(`Error in Spawn process for cmd ${cmd} stderr: ${error}`);
  });

  child.on('close', (code, err) => {
    if (code !== 0) {
      message =
        'Closing spawn with code' +
        code?.toString() +
        'Error:' +
        err?.toString();
      console.error(
        `Closing spawn due to error for cmd ${cmd} stderr: ${err?.toString()}`,
      );
      errorSeen = true;
    } else {
      message = SUCCESS_MESSAGE;
    }
  });
};

export const installFirmware = (firmwareFile: string) => {
  try {
    if (CAMERA_TYPE === CameraType.Hdc) {
      try {
        execSync(`test -f ${HDC_ROOT + firmwareFile}`, {
          encoding: 'utf-8',
        });
      } catch (error: unknown) {
        console.log('Rauc file is not present');
      }
      runSpawn(`rauc install ${HDC_ROOT + firmwareFile}`);
      return { output: 'received install command' };
    } else if (
      CAMERA_TYPE === CameraType.HdcS ||
      CAMERA_TYPE === CameraType.Bee
    ) {
      try {
        execSync(`test -f ${MENDER_PATH} && rm ${MENDER_PATH}`, {
          encoding: 'utf-8',
        });
      } catch (error: unknown) {
        errorSeen = true;
        console.log('Mender file is not present');
      }
      try {
        execSync(`test -f ${FIP_PATH}  && rm ${FIP_PATH}`, {
          encoding: 'utf-8',
        });
      } catch (error: unknown) {
        errorSeen = true;
        console.log('Fip file is not present');
      }
      runSpawn(
        `tar -xzf /data/${firmwareFile} -C /data && os-update --install ${MENDER_PATH} && movisoc-fwu -a ${FIP_PATH}`,
      );
      return { output: 'received install command' };
    }
  } catch (error: unknown) {
    errorSeen = true;
    return { error };
  }
};
