import express from 'express';
import router from './routes';
import busboy from 'connect-busboy';
import { PUBLIC_FOLDER, PORT } from './config';
import { serviceRunner } from 'services';
import { LedService } from 'services/led';
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

  serviceRunner.add(LedService);
  // serviceRunner.add(AssistNowService);

  serviceRunner.run();
}

initAppServer();
