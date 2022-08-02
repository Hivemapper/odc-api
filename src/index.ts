import express from 'express';
import router from './routes';
import { FRAMES_ROOT_FOLDER, GPS_ROOT_FOLDER, PORT } from './config';
import { serviceRunner } from 'services';
import { LedService } from 'services/led';
import { COLORS, updateLED } from 'util/led';

export async function initAppServer() {
  const app = express();

  // Making all the files accessible via direct HTTP urls
  app.use('/public/frames', express.static(FRAMES_ROOT_FOLDER));
  app.use('/public/gps', express.static(GPS_ROOT_FOLDER));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(router);

  await new Promise<void>((resolve, reject) => {
    app.listen(PORT, resolve);
  });
  console.log(
    `Dashcam API (process ${process.pid}) started and listening on ${PORT}`,
  );
  updateLED(COLORS.RED, COLORS.RED, COLORS.RED);

  serviceRunner.add(LedService);

  serviceRunner.run();
}

initAppServer();
