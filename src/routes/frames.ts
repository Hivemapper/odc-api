import { FRAMES_ROOT_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import { readdir } from 'fs';

import { filterBySinceUntil, getDateFromUnicodeTimastamp } from '../util';
import { ICameraFile } from '../types';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    readdir(
      FRAMES_ROOT_FOLDER,
      (err: NodeJS.ErrnoException | null, files: string[]) => {
        try {
          const jpgFiles: ICameraFile[] = files
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
      },
    );
  } catch (error) {
    res.json({ error });
  }
});

export default router;
