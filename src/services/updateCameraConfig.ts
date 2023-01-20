import { exec } from 'child_process';
import { CAMERA_TYPE, CMD, IMAGER_CONFIG_PATH } from 'config';
import { writeFile } from 'fs';
import { CameraType, IService } from 'types';
import { getCameraConfig, sleep } from 'util/index';

export const UpdateCameraConfigService: IService = {
  execute: async () => {
    if (CAMERA_TYPE !== CameraType.Hdc) {
      return;
    }
    console.log('Updating camera config');

    try {
      writeFile(
        IMAGER_CONFIG_PATH,
        JSON.stringify(getCameraConfig()),
        {
          encoding: 'utf-8',
        },
        () => restartCamera(),
      );
    } catch (e: unknown) {
      console.log('Camera Config service failed with error', e);
    }
  },
  delay: 200,
};

const restartCamera = () => {
  exec(CMD.STOP_CAMERA, async () => {
    // starting RIGHT after another may bring issues on the Pi;
    //  give it ~2secs before start up
    await sleep(2000); 
    exec(CMD.START_CAMERA, () => {
      console.log('Successfully restarted the camera');
    });
  });
};
