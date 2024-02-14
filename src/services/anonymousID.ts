import { existsSync, writeFileSync } from 'fs';
import { IService } from '../types';
import { generate } from 'shortid';
import { ANONYMOUS_ID_FILE } from 'config';

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
