import { CAMERA_TYPE, FRAMES_ROOT_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import { existsSync, readdir, readFile } from 'fs';

import {
  filterBySinceUntil,
  getDateFromUnicodeTimastamp,
  getQuality,
} from '../util';
import { CameraType, ICameraFile } from '../types';
import { exec, ExecException } from 'child_process';
import { Instrumentation } from 'util/instrumentation';

export const tmpFrameName = 'cam0pipe.jpg';
const router = Router();

let firstFileFetched = false;

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

          const filteredFiles = filterBySinceUntil(jpgFiles, req);

          if (!firstFileFetched && filteredFiles.length) {
            firstFileFetched = true;
            Instrumentation.add({
              event: 'DashcamFetchedFirstImages',
            });
          }

          res.json(filteredFiles);
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
      `ls -t ${FRAMES_ROOT_FOLDER}/*.jpg | head -2`,
      {
        encoding: 'utf-8',
      },
      (error: ExecException | null, stdout: string) => {
        if (!error) {
          const names = stdout.split('\n');
          let filename = names[0];
          if (filename === tmpFrameName && names.length > 1) {
            filename = names[2];
          }
          filename = filename.split('/').pop() || '';
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
      return res.json({ quality: 70 });
    }
    res.json({ quality: getQuality() });
  } catch (error) {
    res.json({ error });
  }
});

export default router;
