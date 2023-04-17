import { exec } from 'child_process';
import { CAMERA_TYPE, CMD, NEW_IMAGER_CONFIG_PATH } from 'config';
import { writeFile } from 'fs';
import { CameraType, IService } from 'types';
import { getNewCameraConfig, sleep } from 'util/index';

export const UpdateCameraResolutionService: IService = {
  execute: async () => {
    if (CAMERA_TYPE !== CameraType.Hdc) {
      return;
    }
    console.log('Updating camera res');

    try {
      const cameraConfig = await getNewCameraConfig();
      if (cameraConfig) {
        writeFile(
          NEW_IMAGER_CONFIG_PATH,
          JSON.stringify(cameraConfig),
          {
            encoding: 'utf-8',
          },
          () => restartCamera(),
        );
      } else {
        console.log('No camera resolution to update');
      }
    } catch (e: unknown) {
      console.log('New Camera Config service failed with error', e);
    }
  },
  delay: 2200,
};

const restartCamera = () => {
  exec(CMD.STOP_CAMERA, async () => {
    // Give it a couple of seconds for it to fully stop before starting up again
    await sleep(2000);
    exec(CMD.START_CAMERA, () => {
      console.log(
        'Updated camera resolution and successfully restarted the camera',
      );
    });
  });
};
