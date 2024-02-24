import { exec } from 'child_process';
import { CAMERA_TYPE } from 'config';
import { getConfig } from 'sqlite/config';
import { CameraType, IService } from 'types';

export const SetSwappinessService: IService = {
  execute: async () => {
    try {
      const swappiness = await getConfig(CAMERA_TYPE === CameraType.Hdc ? 'HdcSwappiness' : 'HdcsSwappiness');
      if (Number.isInteger(swappiness) && swappiness >= 0 && swappiness <= 100) {
        exec(`sysctl vm.swappiness=${swappiness}`);
      }
    } catch (error: unknown) {
      console.log(error);
    }
  },
};
