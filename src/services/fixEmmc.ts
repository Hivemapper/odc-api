import { existsSync, writeFileSync } from 'fs';
import { exec } from 'child_process';
import { IService } from '../types';
const EMMC_FIXED_LOG = '/mnt/data/emmc_fixed';

export const FixEmmcService: IService = {
  execute: async () => {
    const done = existsSync(EMMC_FIXED_LOG);
    if (!done) {
      try {
        // making sure we perform this operation only once, even if it failed.
        // otherwise device can get into the retry loop
        writeFileSync(EMMC_FIXED_LOG, '');
        console.log('Executing script to fix EMMC writing performance');
        exec('/opt/dashcam/bin/fix_emmc.sh');
      } catch (e: unknown) {
        console.log(e);
        writeFileSync(EMMC_FIXED_LOG, JSON.stringify(e));
      }
    }
  },
  delay: 10000,
};
