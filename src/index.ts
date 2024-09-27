import express, { Application } from 'express';
import router from './routes';
import { Server } from 'http';
import busboy from 'connect-busboy';
import { PUBLIC_FOLDER, PORT, TMP_PUBLIC_FOLDER } from './config';
import { serviceRunner } from 'services';
import { HeartBeatService } from 'services/heartBeat';
import { InitIMUCalibrationService } from 'services/initIMUCalibration';
import { InitCronService } from 'services/initCron';
import { UpdateMotionModelConfigService } from 'services/updateMotionModelConfig';
import { DeviceInfoService } from 'services/deviceInfo';
import { IntegrityCheckService } from 'services/integrityCheck';
import { SetSwappinessService } from 'services/setSwappiness';
import { StartObjectDetection } from 'services/startObjectDetection';
import { LoadPrivacyService } from 'services/loadPrivacy';
import { LogDbFileSize } from 'services/logDbFileSize';
import { TrackDownloadDebt } from 'services/trackDownloadDebt';
import { CommitFirmwareVersion } from 'services/commitFirmwareVersion';
import { setSessionId, startSystemTimer } from 'util/index';
import { initUbxSessionAndSignatures } from 'ubx/session';
import console_stamp from 'console-stamp';
import { Instrumentation } from 'util/instrumentation';
import { isTimeSet } from 'util/lock';
import { MotionModelController } from 'util/motionModel/motionModelController';
import { UsbStateCheckService } from 'services/usbStateCheck';
import Bonjour from 'bonjour';
import { closeWebSocketServer, createWebSocketServer } from 'websockets';

export async function initAppServer(): Promise<Application> {
  const app: Application = express();
  const server = new Server(app);
  createWebSocketServer(server);

  app.use((req, res, next) => {
    console.log(`Received request: ${req.method} ${req.url}`);
    next();
  });

  // Making all the files accessible via direct HTTP urls
  app.use('/public', express.static(PUBLIC_FOLDER));

  // for the preview photos to adjust the dashcam
  app.use('/tmp', express.static(TMP_PUBLIC_FOLDER));

  app.use(
    busboy({
      highWaterMark: 2 * 1024 * 1024, // Set 2MiB buffer
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(router);

  await new Promise<void>((resolve, reject) => {
    server.listen(PORT, resolve);
  });

  console.log(
    `Dashcam API (process ${process.pid}) started and listening on ${PORT}`,
  );

  const bonjour = Bonjour();
  const bonjourService = await bonjour.publish({
    name: 'DashcamService',
    type: 'dashcam',
    port: PORT,
  });

  bonjourService.start();

  console.log('Bonjour service published');

  try {
    // Setting up logger
    console_stamp(console);
  } catch (e: unknown) {
    console.log(e);
  }

  try {
    setSessionId();
    if (isTimeSet()) {
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
    serviceRunner.add(InitIMUCalibrationService);
    serviceRunner.add(InitCronService);
    // serviceRunner.add(TrackDownloadDebt);
    serviceRunner.add(LoadPrivacyService);
    serviceRunner.add(UsbStateCheckService);
    serviceRunner.add(SetSwappinessService);
    serviceRunner.add(LogDbFileSize);
    serviceRunner.add(CommitFirmwareVersion);

    // Execute motion model
    MotionModelController();

    serviceRunner.run();
  } catch (e: unknown) {
    console.log('Error running services:', e);
  }

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Promise Rejection:', reason);
  });

  let isShuttingDown = false;

  async function gracefulShutdown(signal: string, err?: Error) {
    if (isShuttingDown) {
      console.log('Shutdown already in progress. Please wait...');
      return;
    }
    isShuttingDown = true;

    if (err) {
      console.error('Uncaught Exception:', err);
    } else {
      console.log(`${signal} signal received. Shutting down gracefully...`);
    }

    const timeout = setTimeout(() => {
      console.log('Forcefully shutting down.');
      // restartPrivacyProcess();
      process.exit(1);
    }, 5000);

    try {
      // Close WebSocket server
      await closeWebSocketServer();

      // Close HTTP server
      await new Promise<void>((resolve, reject) => {
        server.close(err => {
          clearTimeout(timeout);
          if (err) {
            console.error('Error closing HTTP server:', err);
            reject(err);
          } else {
            console.log('HTTP server closed successfully');
            resolve();
          }
        });
      });

      // Stop Bonjour service
      await new Promise<void>(resolve => {
        bonjourService.stop(() => {
          console.log('Bonjour service unpublished');
          bonjour.destroy();
          resolve();
        });
      });

      console.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  process.on('uncaughtException', err => {
    gracefulShutdown('UncaughtException', err);
  });

  process.on('SIGTERM', () => {
    gracefulShutdown('SIGTERM');
  });

  process.on('SIGINT', () => {
    gracefulShutdown('SIGINT');
  });

  return app;
}

export const app = initAppServer();
