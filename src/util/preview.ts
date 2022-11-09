import { exec, execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { IMAGER_CONFIG_PATH, CMD } from 'config';
import { setPreviewStatus } from 'services/heartBeat';
import { getCameraConfig, getPreviewConfig, sleep } from 'util/index';

let timer: any = undefined;

export const startPreview = async () => {
  if (timer) {
    clearTimeout(timer);
  }
  timer = setTimeout(stopPreview, 100000);
  setPreviewStatus(true);
  try {
    await execSync('mkdir /tmp/recording/preview', {
      encoding: 'utf-8',
    });
  } catch (e: unknown) {
    console.log(e);
  }

  try {
    writeFileSync(IMAGER_CONFIG_PATH, JSON.stringify(getPreviewConfig()), {
      encoding: 'utf-8',
    });
  } catch (e: unknown) {
    console.log(e);
  }
  await execSync(CMD.STOP_CAMERA, {
    encoding: 'utf-8',
  });
  await sleep(1000);
  await execSync(CMD.START_CAMERA, {
    encoding: 'utf-8',
  });
  await sleep(500);
  await execSync(CMD.START_PREVIEW, {
    encoding: 'utf-8',
  });
};

export const stopPreview = async () => {
  if (timer) {
    clearTimeout(timer);
  }
  setPreviewStatus(false);
  await execSync(CMD.STOP_PREVIEW, {
    encoding: 'utf-8',
  });
  try {
    writeFileSync(IMAGER_CONFIG_PATH, JSON.stringify(getCameraConfig()), {
      encoding: 'utf-8',
    });
  } catch (e: unknown) {
    console.log(e);
  }
  await execSync(CMD.STOP_CAMERA, {
    encoding: 'utf-8',
  });
  await sleep(1000);
  await execSync(CMD.START_CAMERA, {
    encoding: 'utf-8',
  });

  // No need to wait for this one
  try {
    exec('rm -r /tmp/recording/preview', {
      encoding: 'utf-8',
    });
  } catch (e: unknown) {
    console.log(e);
  }
};
