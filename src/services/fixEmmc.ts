import { existsSync, writeFileSync } from 'fs';
import { exec, execSync } from 'child_process';
import { IService } from '../types';
const EMMC_FIXED_LOG = '/mnt/data/emmc_fixed';

export const FixEmmcService: IService = {
  execute: async () => {
    const done = existsSync(EMMC_FIXED_LOG);
    if (!done) {
      try {
        console.log('Preparing script to fix EMMC writing performance');
        //
        execSync('chmod 755 /opt/dashcam/bin/fix_emmc.sh');
        // Better create new file the way they do it! And just execute if exists!
        console.log('Executing');
        exec(`/opt/dashcam/bin/fix_emmc.sh`);
        // BE CAREFUL
        // This code is unreachable. Cause fix_emmc stops the ODC API.
      } catch (e: unknown) {
        console.log(e);
        writeFileSync(EMMC_FIXED_LOG, JSON.stringify(e));
      }
    }
  },
};
