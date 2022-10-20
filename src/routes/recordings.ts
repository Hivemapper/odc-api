import { FRAMES_ROOT_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import { readdir, readFile } from 'fs';

import { filterBySinceUntil, getDateFromUnicodeTimastamp } from '../util';
import { ICameraFile } from '../types';
import { exec, ExecException } from 'child_process';

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

router.get('/last', async (req: Request, res: Response) => {
  try {
    exec(
      `ls ${FRAMES_ROOT_FOLDER} | tail -1`,
      {
        encoding: 'utf-8',
      },
      (error: ExecException | null, stdout: string) => {
        if (!error) {
          const filename = stdout.split('\n')[0];
          res.json({
            path: filename,
            date: getDateFromUnicodeTimastamp(filename).getTime(),
          });
        } else {
          res.json({ error });
        }
      },
    );
  } catch (error) {
    res.json({ error });
  }
});

router.get('/quality', async (req: Request, res: Response) => {
  res.json({ quality: 80 }); // TBD for hdc-s
});

export default router;
