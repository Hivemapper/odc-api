import { GPS_ROOT_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import { readdirSync } from 'fs';

import { filterBySinceUntil, getDateFromFilename } from '../util';
import { ICameraFile } from '../types';
import { setMostRecentPing } from 'services/led';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const files = readdirSync(GPS_ROOT_FOLDER);
    if (files.length) {
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
  res.json({
    age: 98,
    timestamp: '2022-05-04T00:49:31.800Z',
    longitude: -70.9298776,
    latitude: 42.9783255,
    height: 28.7600021,
    heading: 311.197052,
    speed: 0.0200000014,
    velocity: [0.0130000002, -0.0150000005, 0.018000001],
    satellite_count: 14,
    fix_type: 3,
    flags: [1, 234, 0],
    dop: 1.81999993,
  });
});

export default router;
