import { FRAMES_ROOT_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import { readdirSync } from 'fs';

import { filterBySinceUntil, getDateFromUnicodeTimastamp } from '../util';
import { CameraFile } from '../types';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const files = await readdirSync(FRAMES_ROOT_FOLDER);
    const jpgFiles: CameraFile[] = files
      .filter((filename: string) => filename.indexOf('.jpg') !== -1)
      .map(filename => {
        return {
          path: filename,
          date: getDateFromUnicodeTimastamp(filename).getTime(),
        };
      });

    res.json(filterBySinceUntil(jpgFiles, req));
  } catch (error) {
    res.json({ error });
  }
});

export default router;
