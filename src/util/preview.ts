import { exec, execSync } from 'child_process';
import {
  getStartCameraCommand,
  getStartPreviewCommand,
  getStopCameraCommand,
  getStopPreviewCommand,
} from 'config';
import { setPreviewStatus } from 'services/heartBeat';
import { sleep } from 'util/index';

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

  await execSync(
    `sed -i "s/mnt\\/data\\/pic/tmp\\/recording\\/pic/g" /opt/dashcam/bin/config.json`,
    {
      encoding: 'utf-8',
    },
  );
  await execSync(getStopCameraCommand(), {
    encoding: 'utf-8',
  });
  await sleep(1000);
  await execSync(getStartCameraCommand(), {
    encoding: 'utf-8',
  });
  await sleep(500);
  await execSync(getStartPreviewCommand(), {
    encoding: 'utf-8',
  });
};

export const stopPreview = async () => {
  if (timer) {
    clearTimeout(timer);
  }
  setPreviewStatus(false);
  await execSync(getStopPreviewCommand(), {
    encoding: 'utf-8',
  });
  await execSync(
    `sed -i "s/tmp\\/recording\\/pic/mnt\\/data\\/pic/g" /opt/dashcam/bin/config.json`,
    {
      encoding: 'utf-8',
    },
  );
  await execSync(getStopCameraCommand(), {
    encoding: 'utf-8',
  });
  await sleep(1000);
  await execSync(getStartCameraCommand(), {
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
