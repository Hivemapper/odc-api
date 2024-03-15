import { exec } from 'child_process';
import { IService } from 'types';

export const StartObjectDetection: IService = {
  execute: async () => {
    try {
      exec('systemctl start object-detection');
    } catch (error: unknown) {
      console.log(error);
    }
  },
  delay: 80000,
};
