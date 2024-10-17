import { exec } from 'child_process';
import { CAMERA_TYPE } from 'config';
import { getConfig } from 'sqlite/config';
import { CameraType, IService } from 'types';

export const SetSwappinessService: IService = {
  execute: async () => {
    try {
      let param = '';
      switch (CAMERA_TYPE) {
        case CameraType.Hdc:
          param = 'HdcSwappiness';
          break;
        case CameraType.HdcS:
          param = 'HdcsSwappiness';
          break;
        case CameraType.Bee:
          param = 'BeeSwappiness';
          break;
        default:
          return;
      }
      const swappiness = await getConfig(param);
      if (Number.isInteger(swappiness) && swappiness >= 0 && swappiness <= 100) {
        exec(`sysctl vm.swappiness=${swappiness}`);
      }
    } catch (error: unknown) {
      console.log(error);
    }
  },
};
