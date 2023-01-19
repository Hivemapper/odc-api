import { exec } from 'child_process';
import { CAMERA_TYPE, CMD, IMAGER_CONFIG_PATH } from 'config';
import { writeFile } from 'fs';
import { CameraType, IService } from 'types';
import { getCameraConfig } from 'util/index';
import { ifTimeSet } from 'util/lock';

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
        () => {
          if (ifTimeSet()) {
            exec(CMD.STOP_CAMERA, () => {
              exec(CMD.START_CAMERA, () => {
                console.log('Successfully restarted the camera');
              });
            });
          } else {
            // do not restart the camera for image rotation
            // it will be restarted on 3d lock anyways
          }
        },
      );
    } catch (e: unknown) {
      console.log('Camera Config service failed with error', e);
    }
  },
  delay: 200,
};
