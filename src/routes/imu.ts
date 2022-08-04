import { IMU_ROOT_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import { readdirSync } from 'fs';

import { filterBySinceUntil, getDateFromFilename } from '../util';
import { ICameraFile } from '../types';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const files = readdirSync(IMU_ROOT_FOLDER);
    if (files.length) {
      // Last IMU file is not finished yet
      files.pop();
    }

    const imuFiles: ICameraFile[] = files
      .filter((filename: string) => filename.indexOf('.json') !== -1)
      .map(filename => {
        return {
          path: filename,
          date: getDateFromFilename(filename).getTime(),
        };
      });

    res.json(filterBySinceUntil(imuFiles, req));
  } catch (error) {
    res.json({ error });
  }
});

// TODO
router.get('/sample', async (req: Request, res: Response) => {
  res.json({
    age: 362,
    received_at: 1107921,
    temperature: 20.2143707,
    accelerometer: [-0.008544921875, 0.001220703125, 1.013671875],
    gyroscope: [-0.1220703125, -0.48828125, 0.42724609375],
  });
});

export default router;
