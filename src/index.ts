import express, { Application } from 'express';
import router from './routes';
import busboy from 'connect-busboy';
import { PUBLIC_FOLDER, PORT, TMP_PUBLIC_FOLDER } from './config';
import { serviceRunner } from 'services';
import { HeartBeatService } from 'services/heartBeat';
import { InitCronService } from 'services/initCron';
import { UpdateMotionModelConfigService } from 'services/updateMotionModelConfig';
import { MotionModelService } from 'services/motionModel';
import { DeviceInfoService } from 'services/deviceInfo';
import { IntegrityCheckService } from 'services/integrityCheck';
import { TrackDownloadDebt } from 'services/trackDownloadDebt';
import { setSessionId, startSystemTimer } from 'util/index';
import { initUbxSessionAndSignatures } from 'ubx/session';
import console_stamp from 'console-stamp';
import { Instrumentation } from 'util/instrumentation';
import { DEFAULT_TIME } from 'util/lock';

export async function initAppServer(): Promise<Application> {
  const app: Application = express();

  // Making all the files accessible via direct HTTP urls
  app.use('/public', express.static(PUBLIC_FOLDER));

  // for the preview photos to adjust the dashcam
  app.use('/tmp', express.static(TMP_PUBLIC_FOLDER));

  app.use(
    busboy({
      highWaterMark: 2 * 1024 * 1024, // Set 2MiB buffer
    }),
  ); // Handles file uploads for Over-The-Air update
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(router);

  await new Promise<void>((resolve, reject) => {
    app.listen(PORT, resolve);
  });
  console.log(
    `Dashcam API (process ${process.pid}) started and listening on ${PORT}`,
  );

  try {
    // Setting up logger
    console_stamp(console);
  } catch (e: unknown) {
    console.log(e);
  }

  try {
    setSessionId();
    if (Date.now() > DEFAULT_TIME) {
      Instrumentation.setHotLoad(true);
    }
    Instrumentation.add({
      event: 'DashcamLoaded',
    });
    startSystemTimer();
  } catch (e: unknown) {
    console.log('Error initiating system variables');
  }

  try {
    serviceRunner.add(UpdateMotionModelConfigService);
    serviceRunner.add(HeartBeatService);
    serviceRunner.add(IntegrityCheckService);
    serviceRunner.add(DeviceInfoService);
    serviceRunner.add(InitCronService);
    serviceRunner.add(TrackDownloadDebt);
    serviceRunner.add(MotionModelService);

    serviceRunner.run();
  } catch (e: unknown) {
    console.log('Error running services:', e);
  }

  try {
    initUbxSessionAndSignatures();
  } catch (e: unknown) {
    console.log('Error setting M9N session ID:', e);
  }

  return app;
}

export const app = initAppServer();
