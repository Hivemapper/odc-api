import express, { Application } from 'express';
import router from './routes';
import busboy from 'connect-busboy';
import { PUBLIC_FOLDER, PORT, TMP_PUBLIC_FOLDER } from './config';
import { serviceRunner } from 'services';
import { HeartBeatService } from 'services/heartBeat';
import { InitCronService } from 'services/initCron';
import { UpdateMotionModelConfigService } from 'services/updateMotionModelConfig';
import { MotionModelServise } from 'services/motionModel';
import { DeviceInfoService } from 'services/deviceInfo';
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
    serviceRunner.add(HeartBeatService);
    // serviceRunner.add(UpdateCameraConfigService);
    // serviceRunner.add(UpdateCameraResolutionService);
    serviceRunner.add(DeviceInfoService);
    serviceRunner.add(InitCronService);
    serviceRunner.add(TrackDownloadDebt);
    serviceRunner.add(MotionModelServise);
    serviceRunner.add(UpdateMotionModelConfigService);

    serviceRunner.run();
  } catch (e: unknown) {
    console.log('Error running services:', e);
  }

  try {
    initUbxSessionAndSignatures();
  } catch (e: unknown) {
    console.log('Error setting M9N session ID:', e);
  }

  // server to listen for port 80 and answer with 204
  // try {
  //   const captiveApp = express();
  //   captiveApp.all('*', (req: Request, res: Response) => {
  //     res.status(204).send();
  //   });
  //   captiveApp.listen(80, () => {
  //     console.log('Captive Redirect Server started on port 80');
  //   });
  // } catch (e: unknown) {
  //   console.log('Error setting up second server on port 80');
  // }
  return app;
}

export const app = initAppServer();
