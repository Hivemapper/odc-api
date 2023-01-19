import { IMU_ROOT_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import { readdirSync } from 'fs';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';

import { filterBySinceUntil, getDateFromFilename } from '../util';
import { ICameraFile } from '../types';
import { setMostRecentPing } from '../services/heartBeat';

const router = Router();
let imuLogger: ChildProcessWithoutNullStreams;
let timeStarted: any;

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

router.get('/live', async (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-control': 'no-cache',
  });

  try {
    if (imuLogger) {
      imuLogger.kill();
    }
    imuLogger = spawn(__dirname + '/imu-logger', ['--live']);
    timeStarted = new Date();

    imuLogger.stdout.on('data', function (data: string) {
      res.write('data: ' + data.toString() + '\n\n');
      if (timeStarted && Date.now() - timeStarted.getTime() > 60000) {
        console.log('IMU live timeout');
        imuLogger.kill();
      }
    });

    imuLogger.on('close', function () {
      res.end('');
      imuLogger.kill();
    });

    imuLogger.on('error', function (err) {
      console.log(err);
      res.end('');
      imuLogger.kill();
    });

    imuLogger.stderr.on('data', function (data: string) {
      res.end('stderr: ' + data);
      imuLogger.kill();
    });
  } catch (e: unknown) {
    if (imuLogger) {
      imuLogger.kill();
    }
    res.end('');
  }
});

router.get('/status', async (req: Request, res: Response) => {
  res.json({
    status: imuLogger ? 'started' : 'stopped',
  });
});

router.get('/close', async (req: Request, res: Response) => {
  if (imuLogger) {
    imuLogger.kill();
  }
  res.json({
    output: 'done',
  });
});

// TODO
router.get('/sample', async (req: Request, res: Response) => {
  setMostRecentPing(Date.now());
  res.json({
    age: 362,
    received_at: 1107921,
    temperature: 20.2143707,
    accelerometer: [-0.008544921875, 0.001220703125, 1.013671875],
    gyroscope: [-0.1220703125, -0.48828125, 0.42724609375],
  });
});

export default router;
