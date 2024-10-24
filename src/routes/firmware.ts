import { spawn, execSync } from 'child_process';
import { CAMERA_TYPE } from 'config';

import { Router } from 'express';
import { CameraType } from 'types';
const router = Router();

const HDC_ROOT = '/mnt/data/';
const HDCS_ROOT = '/data/';
const MENDER_PATH = HDCS_ROOT + 'core.mender';
const FIP_PATH = HDCS_ROOT + 'fip.bin';

let message = 'started';
let errorSeen = false;
const SUCCESS_MESSAGE = 'Spwan ran successfully';

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
    } else {
      message = SUCCESS_MESSAGE;
    }
  });
};

router.get('/install', async (req, res) => {
  const firmwareFile = req?.body?.fileName || '';

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
      res.json({ output: 'received install command' });
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
      res.json({ output: 'received install command' });
    }
  } catch (error: unknown) {
    errorSeen = true;
    res.json({ error });
  }
});

router.get('/progress', async (req, res) => {
  res.json({ isRunning: message !== SUCCESS_MESSAGE, errorSeen });
});

export default router;
