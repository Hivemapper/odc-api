import { existsSync, writeFileSync } from 'fs';
import { submitOfflineAlmanac } from 'ubx/almanac';
import { IService } from '../types';
const ALMANAC_CONFIG = '/mnt/data/almanac.log';
const ASSISTNOW_ERROR_LOG = '/mnt/data/almanac_error.log';

export const AssistNowService: IService = {
  execute: async () => {
    const done = existsSync(ALMANAC_CONFIG);
    if (!done) {
      try {
        await submitOfflineAlmanac();
        writeFileSync(ALMANAC_CONFIG, '');
      } catch (e: unknown) {
        writeFileSync(ASSISTNOW_ERROR_LOG, JSON.stringify(e));
      }
    }
  },
};
