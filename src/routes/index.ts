import { Request, Response, Router } from 'express';
import { mkdir, readFileSync, stat, Stats, writeFile, writeFileSync } from 'fs';
import { exec, execSync, spawn } from 'child_process';

import {
  API_VERSION,
  BUILD_INFO_PATH,
  CAMERA_TYPE,
  configureOnBoot,
  FRAMEKM_ROOT_FOLDER,
  HEALTH_MARKER_PATH,
  WEBSERVER_LOG_PATH,
} from '../config';
import recordingsRouter from './recordings';
import gpsRouter from './gps';
import imuRouter from './imu';
import loraRouter from './lora';
import uploadRouter from './upload';
import otaRouter from './ota';
import aclRouter from './acl';
import configRouter from './config';
import kpiRouter from './kpi';
import framekmRouter from './framekm';
import metadataRouter from './metadata';
import utilRouter from './util';
import privacyRouter from './privacy';
import mlRouter from './ml';
import ledRouter from './led';
import dbRouter from './db';
import networkRouter from './network';
import previewRouter from './preview';
import firmwareRouter from './firmware';
import instrumentationRouter from './instrumentation';
import dataloggerRouter from './datalogger';
import { setMostRecentPing } from 'services/heartBeat';
import { getLatestGnssTime, getLockTime, isTimeSet } from 'util/lock';
import {
  addAppConnectedLog,
  getDashcamInfo,
  getSessionId,
  readLast2MB,
} from 'util/index';
import { getCurrentLEDs } from 'util/led';
import { getDeviceInfo } from 'services/deviceInfo';
import { scheduleCronJobs } from 'util/cron';
import { querySensorData } from 'sqlite/common';
import { SensorRecord, SensorQueryResponse } from 'types/sqlite';
import { getAnonymousID } from 'sqlite/deviceInfo';
import { makeFrameKmFolder } from 'util/framekm';

const router = Router();
let isAppConnected = false;

router.use('/api/1', router);
router.use('/recordings', recordingsRouter);
router.use('/gps', gpsRouter);
router.use('/imu', imuRouter);
router.use('/lora', loraRouter);
router.use('/upload', uploadRouter);
router.use('/ota', otaRouter);
router.use('/acl', aclRouter);
router.use('/config', configRouter);
router.use('/kpi', kpiRouter);
router.use('/framekm', framekmRouter);
router.use('/ml', mlRouter);
router.use('/metadata', metadataRouter);
router.use('/util', utilRouter);
router.use('/privacy', privacyRouter);
router.use('/led', ledRouter);
router.use('/db', dbRouter);
router.use('/instrumentation', instrumentationRouter);
router.use('/network', networkRouter);
router.use('/preview', previewRouter);
router.use('/datalogger', dataloggerRouter)
router.use('/firmware', firmwareRouter);

router.get('/init', configureOnBoot);

router.get('/info', async (req: Request, res: Response) => {
  setMostRecentPing(Date.now());
  const dashcamInfo = getDashcamInfo();
  res.json(dashcamInfo);
  await makeFrameKmFolder();
});

router.get('/ping', (req, res) => {
  const deviceInfo = getDeviceInfo();
  setMostRecentPing(Date.now());
  res.json({
    healthy: true,
    cameraTime: getLatestGnssTime() || Date.now(),
    leds: getCurrentLEDs(),
    dashcam: CAMERA_TYPE,
    sessionId: getSessionId(),
    ...getLockTime(),
    ...deviceInfo,
  });
  exec('touch ' + HEALTH_MARKER_PATH);
  if (!isAppConnected) {
    isAppConnected = true;
    addAppConnectedLog();
  }
});

router.get('/locktime', (req, res) => {
  res.json(getLockTime());
  if (!isAppConnected) {
    isAppConnected = true;
    addAppConnectedLog();
  }
});

router.get('/time', (req, res) => {
  res.json(getLatestGnssTime() || Date.now());
});

router.post('/cron', (req, res) => {
  try {
    scheduleCronJobs(req && req.body && req.body.config ? req.body.config : []);
    res.json({
      output: 'done',
    });
  } catch (error: unknown) {
    res.json({ error });
  }
});

router.get('/log', async (req: Request, res: Response) => {
  let log = '';
  try {
    log = await readLast2MB(WEBSERVER_LOG_PATH);
    if (log) {
      stat(
        WEBSERVER_LOG_PATH,
        (err: NodeJS.ErrnoException | null, stats: Stats) => {
          if (stats.size > 1024 * 1024 * 2) {
            // if log is getting bigger than 2Megs,
            // wipe it
            writeFile(
              WEBSERVER_LOG_PATH,
              '',
              {
                encoding: 'utf-8',
              },
              () => {},
            );
            log += '/n===== CUT =====';
          }
        },
      );
    }
  } catch (error) {
    console.log('Webserver Log file is missing');
  }
  res.json({
    log,
  });
});

router.delete('/log', async (req: Request, res: Response) => {
  try {
    writeFileSync(WEBSERVER_LOG_PATH, '', {
      encoding: 'utf-8',
    });
  } catch (error) {
    console.log('Webserver Log file is missing');
  }
  res.json({
    output: 'done',
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
          console.log(error);
          res.json({ error: stdout || stderr });
        } else {
          console.log(stdout);
          res.json({
            output: stdout,
          });
        }
      },
    );
  } catch (error: unknown) {
    res.json({ error });
  }
});

router.post('/cmd/sync', async (req, res) => {
  try {
    const command = req?.body?.cmd || '';
    if (command.indexOf('install') !== -1) {
      const cmdArgs = command.split(' ');
      const installer = cmdArgs[0];
      const args = [cmdArgs[1], cmdArgs[2]];

      const options: any = {
        stdio: ['inherit', 'pipe', 'inherit'],
      };

      const child = spawn(installer, args, options);
      let output = '';

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', data => {
        output += data.toString();
      });

      child.on('error', error => {
        res.json({ error });
      });

      child.on('close', () => {
        output += ' succeeded';
        res.json({
          output,
        });
      });
    } else {
      const output = execSync(req.body.cmd, {
        encoding: 'utf-8',
      });
      console.log(output);
      res.json({
        output,
      });
    }
  } catch (error: unknown) {
    res.json({ error });
  }
});

router.get('/sensorquery', async (req: Request, res: Response) => {
  let since = 0;
  let until = 0;

  try {
    since = parseInt(req.query.since as string);
  } catch (e) {
    console.log(e);
    res.status(400).json('Failed to parse required field: since');
  }
  try {
    until = parseInt(req.query.until as string);
  } catch (e) {
    console.log(e);
    until = getLatestGnssTime();
  }

  if (!isTimeSet()) {
    res.statusCode = 400;
    res.json({ err: 'dashcam is not ready' });
    return;
  }

  const { gnss, imu, magnetometer } = await querySensorData(since, until);
  const sensordata: SensorRecord[] = [];
  gnss.forEach(value => {
    sensordata.push({ sensor: 'gnss', ...value });
  });
  imu.forEach(value => {
    sensordata.push({ sensor: 'imu', ...value });
  });
  magnetometer.forEach(value => {
    sensordata.push({ sensor: 'magnetometer', ...value });
  });

  const device_id = await getAnonymousID();
  const payload: SensorQueryResponse = {
    metadata: {
      device_id,
      dashcam: CAMERA_TYPE,
    },
    sensordata,
  };
  res.json(payload);
});

export default router;
