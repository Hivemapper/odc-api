import express from 'express';
import router from './routes';
import busboy from 'connect-busboy';
import { PUBLIC_FOLDER, PORT } from './config';
import { serviceRunner } from 'services';
import { HeartBeatService } from 'services/heartBeat';
import { ImageRotationService } from 'services/imageRotation';
import { FixEmmcService } from 'services/fixEmmc';
// import { StopCameraOnBootService } from 'services/stopCameraOnBoot';
import { setSessionId } from 'util/index';
import console_stamp from 'console-stamp';

//import { BootNetworkService } from 'services/bootNetwork';
// import { AssistNowService } from 'services/assistNow';

export async function initAppServer() {
  const app = express();

  // Making all the files accessible via direct HTTP urls
  app.use('/public', express.static(PUBLIC_FOLDER));
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
    // serviceRunner.add(StopCameraOnBootService);
    serviceRunner.add(HeartBeatService);
    serviceRunner.add(ImageRotationService);
    serviceRunner.add(FixEmmcService);
    // serviceRunner.add(BootNetworkService);
    // serviceRunner.add(AssistNowService);
    serviceRunner.run();
    setSessionId();
  } catch (e: unknown) {
    console.log('Error running services:', e);
  }
}

initAppServer();
