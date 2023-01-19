import { CAMERA_TYPE, FRAMES_ROOT_FOLDER, IMAGER_BRIDGE_PATH } from 'config';
import { Request, Response, Router } from 'express';
import { existsSync, readdir, readFile } from 'fs';

import { filterBySinceUntil, getDateFromUnicodeTimastamp } from 'util/index';
import { CameraType, ICameraFile } from 'types';
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

router.get('/pic/:name', (req: Request, res: Response) => {
  try {
    const name = req.params.name;
    if (existsSync(FRAMES_ROOT_FOLDER + '/' + name)) {
      readFile(
        FRAMES_ROOT_FOLDER + '/' + name,
        (err: NodeJS.ErrnoException | null, data: Buffer) => {
          if (!err) {
            res.json({
              binary: data,
            });
          } else {
            res.json({ error: err });
          }
        },
      );
    }
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
  try {
    if (CAMERA_TYPE === CameraType.HdcS) {
      // TODO: placeholder
      return res.json({ quality: 70 });
    }
    readFile(
      IMAGER_BRIDGE_PATH,
      {
        encoding: 'utf-8',
      },
      (err: NodeJS.ErrnoException | null, data: string) => {
        if (err) {
          res.json({ error: err });
          return;
        }
        if (data) {
          const parts = data.split(' ');
          const qualityInd = parts.indexOf('--quality');

          if (qualityInd !== -1) {
            res.json({ quality: Number(parts[qualityInd + 1]) });
          } else {
            res.json({ error: 'No quality specified' });
          }
        } else {
          res.json({ error: 'Quality is not set' });
        }
      },
    );
  } catch (error) {
    res.json({ error });
  }
});

export default router;
