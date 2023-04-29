import { exec, spawn } from 'child_process';
import { MAX_DOWNLOAD_DEBT } from 'config';
import { IService } from '../types';

export const TrackDownloadDebt: IService = {
  execute: async () => {
    try {
      exec('du -sb /mnt/data/framekm', (error, stdout) => {
        if (!error) {
          const total = Number(stdout.split('\t')[0]);
          if (total && total > MAX_DOWNLOAD_DEBT) {
            const child = spawn(
              `ls /mnt/data/framekm -1t | tail -50 | xargs printf -- '/mnt/data/framekm/%s\n' | xargs rm -f`,
            );
            child.on('close', () => {
              spawn(
                `ls /mnt/data/metadata -1t | tail -50 | xargs printf -- '/mnt/data/framekm/%s\n' | xargs rm -f`,
              );
            });
          }
        }
      });
    } catch (e: unknown) {
      console.log(e);
    }
  },
  interval: 477777,
};
