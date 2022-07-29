import { Request, Response, Router } from 'express';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

import { API_VERSION, BUILD_INFO_PATH, configureOnBoot } from '../config';
import framesRouter from './frames';
import gpsRouter from './gps';
import imuRouter from './imu';
import loraRouter from './lora';

const router = Router();

router.use('/api/1', router);
router.use('/frames', framesRouter);
router.use('/gps', gpsRouter);
router.use('/imu', imuRouter);
router.use('/lora', loraRouter);

router.get('/init', configureOnBoot);

router.get('/info', async (req: Request, res: Response) => {
  let versionInfo = {};
  try {
    const versionInfoPayload = await readFileSync(BUILD_INFO_PATH, {
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
    const output = await execSync(req.body.cmd, {
      encoding: 'utf-8',
    });
    res.json({
      output,
    });
  } catch (error: any) {
    res.json({ error: error.stdout || error.stderr });
  }
});

export default router;
