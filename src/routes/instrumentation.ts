import { WEBSERVER_LOG_PATH } from 'config';
import { Request, Response, Router } from 'express';
import { createReadStream, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { deleteLogsIfTooBig } from 'util/index';
import { Instrumentation } from 'util/instrumentation';
const router = Router();

const MAX_EVENTS_COUNT = 30000;

router.get('/', async (req: Request, res: Response) => {
  let events = '';
  let counter = 0;
  try {
    const fileStream = createReadStream(WEBSERVER_LOG_PATH);

    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });
    // Note: we use the crlfDelay option to recognize all instances of CR LF
    // ('\r\n') in input.txt as a single line break.

    for await (const line of rl) {
      // Each line in input.txt will be successively available here as `line`.
      if (line.indexOf('[INFO]') !== -1) {
        events = events + line + '\r\n';
        counter++;

        if (counter >= MAX_EVENTS_COUNT) {
          try {
            fileStream.destroy(); // close the stream
          } catch (error: unknown) {
            console.log(error);
          }
          break;
        }
      }
    }

    res.json({ events });
  } catch (e: unknown) {
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
  try {
    if (req.body.from) {
      let rest = '';
      const fileStream = createReadStream(WEBSERVER_LOG_PATH);

      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });
      // Note: we use the crlfDelay option to recognize all instances of CR LF
      // ('\r\n') in input.txt as a single line break.

      let found = false;
      for await (const line of rl) {
        if (found) {
          rest = rest + line + '\r\n';
        }
        if (line.indexOf(req.body.from) !== -1) {
          found = true;
        }
      }
      if (rest) {
        try {
          writeFileSync(WEBSERVER_LOG_PATH, rest, {
            encoding: 'utf-8',
          });
        } catch (error) {
          console.log('Webserver Log file is missing');
        }
      }
    } else {
      try {
        writeFileSync(WEBSERVER_LOG_PATH, '', {
          encoding: 'utf-8',
        });
      } catch (error) {
        console.log('Webserver Log file is missing');
      }
    }

    res.json({
      done: true,
    });
    deleteLogsIfTooBig();
  } catch (e: unknown) {
    res.json({
      done: true,
    });
  }
});

export default router;
