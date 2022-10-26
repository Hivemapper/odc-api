import { GPS_LATEST_SAMPLE, GPS_ROOT_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import { readdirSync, readFile } from 'fs';

import { filterBySinceUntil, getDateFromFilename } from '../util';
import { ICameraFile } from '../types';
import { setMostRecentPing } from 'services/heartBeat';
import { exec, ExecException } from 'child_process';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    let files = readdirSync(GPS_ROOT_FOLDER);
    if (files.length) {
      // Filter out latest.log
      files = files.filter((filename: string) => filename !== 'latest.log');
      // Last GPS file is not finished yet
      files.pop();
    }

    const gpsFiles: ICameraFile[] = files
      .filter((filename: string) => filename.indexOf('.json') !== -1)
      .map(filename => {
        return {
          path: filename,
          date: getDateFromFilename(filename).getTime(),
        };
      });

    res.json(filterBySinceUntil(gpsFiles, req));
    setMostRecentPing(Date.now());
  } catch (error) {
    // It's an important route for an App poller to check the connection,
    // so we return successful 200 OK no matter what
    res.json([]);
  }
});

// TODO
router.get('/sample', async (req: Request, res: Response) => {
  try {
    readFile(
      GPS_LATEST_SAMPLE,
      {
        encoding: 'utf-8',
      },
      (err: NodeJS.ErrnoException | null, data: string) => {
        let sample = {};
        if (data && !err) {
          sample = JSON.parse(data);
        }

        res.json(sample);
      },
    );
  } catch (e) {
    console.log(e);
    res.json({});
  }
});

export default router;
