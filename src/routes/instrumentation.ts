import { EVENTS_LOG_PATH } from 'config';
import { Request, Response, Router } from 'express';
import { createReadStream, existsSync } from 'fs';
import { createInterface } from 'readline';
import { deleteLogsIfTooBig } from 'util/index';
import { Instrumentation } from 'util/instrumentation';
import { promises } from 'fs';
import lockfile from 'proper-lockfile';

const router = Router();

const MAX_EVENTS_COUNT = 30000;

router.get('/', async (req: Request, res: Response) => {
  let events = '';
  let counter = 0;
  try {
    if (!existsSync(EVENTS_LOG_PATH)) {
      return res.json({
        events: '',
      });
    }
    // try to lock the file 5 times, 200 msec delay
    const release = await lockfile.lock(EVENTS_LOG_PATH, { retries: [200, 200, 200, 200, 200] });

    try {
      const fileStream = createReadStream(EVENTS_LOG_PATH);

      let responseSent = false;
      const errorHandler = (e: any) => { 
        console.error(e);
        if (!responseSent) {
          responseSent = true;
          res.status(500).json({
             message: 'Internal Server Error',
             events: ''
          });
        }
      }
      fileStream.on('error', errorHandler);
  
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });
      // Note: we use the crlfDelay option to recognize all instances of CR LF
      // ('\r\n') in input.txt as a single line break.

      rl.on('error', errorHandler);
  
      for await (const line of rl) {
        // Each line in input.txt will be successively available here as `line`.
        if (line.indexOf('[INFO]') !== -1) {
          events = events + line + '\r\n';
          counter++;
  
          if (counter >= MAX_EVENTS_COUNT) {
            try {
              if (!fileStream.destroyed) {
                fileStream.destroy();
              }
            } catch (error: unknown) {
              console.error(error);
            }
            break;
          }
        }
      }
  
      if (!responseSent) {
        res.json({ events });
      }
    } finally {
        // Release the lock
        await release();
    }
  } catch (e: unknown) {
    console.error(e);
    res.json({
      events: '',
    });
  }
});

router.post('/event', async (req: Request, res: Response) => {
  try {
    Instrumentation.add({
      event: req.body.event,
    });
    res.json({
      done: true,
    });
  } catch (error: unknown) {
    res.json({
      error,
    });
  }
});

router.post('/clear', async (req: Request, res: Response) => {
  let responseSent = false;

  const sendErrorResponse = (message: string) => {
      if (!responseSent) {
          responseSent = true;
          console.error(message);
          res.status(500).json({
              done: false,
              message
          });
      }
  };

  try {
      if (!existsSync(EVENTS_LOG_PATH)) {
          return res.json({
              done: true
          });
      }

      // try to get lock the file 5 times, 200 msec delay
      const release = await lockfile.lock(EVENTS_LOG_PATH, { retries: [200, 200, 200, 200, 200] });

      try {
          if (req.body.from) {
              let rest = '';
              const fileStream = createReadStream(EVENTS_LOG_PATH);
              fileStream.on('error', (e) => sendErrorResponse(`FileStream error: ${e}`));

              const rl = createInterface({
                  input: fileStream,
                  crlfDelay: Infinity
              });

              rl.on('error', (err) => sendErrorResponse(`Readline error: ${err}`));

              let found = false;
              for await (const line of rl) {
                  if (found) {
                      rest = rest + line + '\r\n';
                  }
                  if (line.indexOf(req.body.from) !== -1) {
                      found = true;
                  }
              }
              try {
                await promises.writeFile(EVENTS_LOG_PATH, rest, {
                    encoding: 'utf-8',
                });
              } catch (error) {
                  sendErrorResponse('Webserver Log file error when writing');
              }
          } else {
              try {
                  await promises.writeFile(EVENTS_LOG_PATH, '', {
                      encoding: 'utf-8',
                  });
              } catch (error) {
                  sendErrorResponse('Webserver Log file error when clearing');
              }
          }
          
          if (!responseSent) {
              res.json({
                  done: true
              });
              deleteLogsIfTooBig();
          }

      } finally {
          // Release the lock
          await release();
      }

  } catch (e: unknown) {
      sendErrorResponse(`General error: ${e}`);
  }
});

export default router;
