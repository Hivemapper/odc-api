import { exec } from 'child_process';
import {
  getStartCameraCommand,
  getStopCameraCommand,
  IMAGER_CONFIG_PATH,
} from 'config';
import { writeFile } from 'fs';
import { IService } from 'types';
import { getCameraConfig } from 'util/index';
import { ifTimeSet } from 'util/lock';

export const ImageRotationService: IService = {
  execute: async () => {
    console.log('Set rotation to 180');

    try {
      writeFile(
        IMAGER_CONFIG_PATH,
        JSON.stringify(getCameraConfig()),
        {
          encoding: 'utf-8',
        },
        () => {
          if (ifTimeSet()) {
            exec(getStopCameraCommand(), () => {
              exec(getStartCameraCommand(), () => {
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
      console.log('Image Rotation service failed with error', e);
    }
  },
  delay: 4000,
};
