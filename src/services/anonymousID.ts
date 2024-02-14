import { existsSync, readFileSync, writeFileSync } from 'fs';
import { IService } from '../types';
import { generate } from 'shortid';

export const ANONYMOUS_ID_FILE = '/mnt/data/anonymousId.txt';

export const AnonymousIDService: IService = {
  execute: async () => {
    const done = existsSync(ANONYMOUS_ID_FILE);
    if (!done) {
      try {
        const anonymousId = generate();
        writeFileSync(ANONYMOUS_ID_FILE, anonymousId);
      } catch (e: unknown) {
        writeFileSync(ANONYMOUS_ID_FILE, JSON.stringify(e));
      }
    }
  },
};
