import { Request, Response, Router } from 'express';
import { readFileSync } from 'fs';
import { exec } from 'child_process';

import {
  API_VERSION,
  BUILD_INFO_PATH,
  configureOnBoot,
  updateFirmware,
} from '../config';
import framesRouter from './frames';
import gpsRouter from './gps';
import imuRouter from './imu';
import loraRouter from './lora';
import uploadRouter from './upload';

const router = Router();

router.use('/api/1', router);
router.use('/recordings', framesRouter);
router.use('/gps', gpsRouter);
router.use('/imu', imuRouter);
router.use('/lora', loraRouter);
router.use('/upload', uploadRouter);

router.use('/ota', updateFirmware);

router.get('/init', configureOnBoot);

router.get('/info', async (req: Request, res: Response) => {
  let versionInfo = {};
  try {
    const versionInfoPayload = readFileSync(BUILD_INFO_PATH, {
      encoding: 'utf-8',
    });
    versionInfo = JSON.parse(versionInfoPayload);
  } catch (error) {
    console.log('Build Info file is missing');
  }
  res.json({
    ...versionInfo,
    api_version: API_VERSION,
  });
});

router.post('/cmd', async (req, res) => {
  try {
    exec(
      req.body.cmd,
      {
        encoding: 'utf-8',
      },
      (error, stdout, stderr) => {
        if (error) {
          res.json({ error: stdout || stderr });
        } else {
          res.json({
            output: stdout,
          });
        }
      },
    );
  } catch (error: any) {
    res.json({ error: error.stdout || error.stderr });
  }
});

export default router;
