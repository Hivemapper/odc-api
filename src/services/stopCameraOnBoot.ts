import { exec } from 'child_process';
import { getStopCameraCommand } from 'config';
import { IService } from 'types';
import { ifTimeSet } from 'util/lock';

export const StopCameraOnBootService: IService = {
  execute: async () => {
    try {
      if (!ifTimeSet()) {
        exec(getStopCameraCommand());
        console.log('Camera stopped on boot');
      }
    } catch (e: unknown) {
      console.log('Image Rotation service failed with error', e);
    }
  },
  delay: 2000,
};
