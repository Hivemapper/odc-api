import express, { Application } from 'express';
import router from './routes';
import busboy from 'connect-busboy';
import { PUBLIC_FOLDER, PORT } from './config';
import { initUbxSessionAndSignatures } from 'ubx/session';
import console_stamp from 'console-stamp';
import { runServices } from 'services/runner';

//import { BootNetworkService } from 'services/bootNetwork';
// import { AssistNowService } from 'services/assistNow';

const app: Application = express();

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

(async () => {
  await new Promise<void>((resolve, reject) => {
    app.listen(PORT, resolve);
  });
})();
console.log(
  `Dashcam API (process ${process.pid}) started and listening on ${PORT}`,
);

try {
  // Setting up logger
  console_stamp(console);
} catch (e: unknown) {
  console.log(e);
}

runServices();

try {
  initUbxSessionAndSignatures();
} catch (e: unknown) {
  console.log('Error setting M9N session ID:', e);
}

export default app;
