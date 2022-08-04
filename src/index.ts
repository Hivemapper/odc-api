import express from 'express';
import router from './routes';
import { FRAMES_ROOT_FOLDER, PORT } from './config';
import { serviceRunner } from 'services';
import { LedService } from 'services/led';
import { AssistNowService } from 'services/assistNow';

export async function initAppServer() {
  const app = express();

  // Making all the files accessible via direct HTTP urls
  app.use(express.static(FRAMES_ROOT_FOLDER));
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
  serviceRunner.add(AssistNowService);

  serviceRunner.run();
}

initAppServer();
