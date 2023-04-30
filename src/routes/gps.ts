import { GPS_LATEST_SAMPLE, GPS_ROOT_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import { readdirSync, readFile } from 'fs';
import { exec, ExecException } from 'child_process';
import { filterBySinceUntil, getDateFromFilename } from '../util';
import { ICameraFile } from '../types';
import { setMostRecentPing } from 'services/heartBeat';
import { jsonrepair } from 'jsonrepair';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    let files = readdirSync(GPS_ROOT_FOLDER);
    if (files.length) {
      // Filter out latest.log
      files = files.filter((filename: string) => filename !== 'latest.log');
      // Last GPS file is not finished yet
      files.pop();
    }

    const gpsFiles: ICameraFile[] = files
      .filter((filename: string) => filename.indexOf('.json') !== -1)
      .map(filename => {
        return {
          path: filename,
          date: getDateFromFilename(filename).getTime(),
        };
      });

    const filteredFiles = filterBySinceUntil(gpsFiles, req);

    res.json(filteredFiles);
    setMostRecentPing(Date.now());
  } catch (error) {
    // It's an important route for an App poller to check the connection,
    // so we return successful 200 OK no matter what
    res.json([]);
  }
});

// TODO
router.get('/sample', async (req: Request, res: Response) => {
  try {
    readFile(
      GPS_LATEST_SAMPLE,
      {
        encoding: 'utf-8',
      },
      (err: NodeJS.ErrnoException | null, data: string) => {
        let sample = {};
        if (data && !err) {
          sample = JSON.parse(jsonrepair(data));
        }

        res.json(sample);
      },
    );
  } catch (e) {
    console.log(e);
    res.json({});
  }
});

router.get('/raw/:num_msgs', async (req: Request, res: Response) => {
  let num_msgs = undefined;
  try {
    num_msgs = parseInt(req.params.num_msgs);
  } catch (e) {
    console.log(e);
    res.statusCode = 400;
    res.json({ err: 'num_msg must be a positive integer' });
    return;
  }
  if (num_msgs < 0) {
    res.statusCode = 400;
    res.json({ err: 'num_msg must be a positive integer' });
    return;
  }
  try {
    exec(
      `gpspipe -R -n ${num_msgs}`,
      { encoding: null },
      (error: ExecException | null, stdout: Buffer) => {
        if (error) {
          res.json({ error });
          return;
        }
        res.json({ b64EncodedBytes: stdout.toString('base64') });
        return;
      },
    );
  } catch (e) {
    console.log(e);
    res.json({ err: e });
    return;
  }
});

router.get('/jamind', async (req: Request, res: Response) => {
  try {
    exec(
      'ubxtool -p MON-RF | grep jamInd',
      { encoding: 'utf-8' },
      (error: ExecException | null, stdout: string) => {
        const output = error ? '' : stdout;
        // get jamInd
        const line = output.split('\n').shift(); // we should only get one in the output
        if (!line) {
          res.json({});
          return;
        }
        const parts = line.split(' ');
        const jamIndIndex = parts.findIndex(
          elem => elem.indexOf('jamInd') !== -1,
        );
        if (jamIndIndex !== -1) {
          const jamInd = parseInt(parts[jamIndIndex + 1]);
          res.json({ jamInd: jamInd, date: new Date() });
          return;
        }
      },
    );
  } catch (e) {
    res.json({});
  }
});

router.get('/spoofdetstate', async (req: Request, res: Response) => {
  try {
    exec(
      'ubxtool -p NAV-STATUS -v 2 | grep spoofDetState',
      { encoding: 'utf-8' },
      (error: ExecException | null, stdout: string) => {
        const output = error ? '' : stdout;
        //get spoofDetState
        const line = output.split('\n').shift(); // hopefully there should be one only
        if (!line) {
          res.json({});
          return;
        }
        const parts = line.split(' ');
        const spoofDetStateIndex = parts.findIndex(
          elem => elem.indexOf('spoofDetState') !== -1,
        );
        if (spoofDetStateIndex !== -1) {
          const spoofDetState = parseInt(parts[spoofDetStateIndex + 1]);
          res.json({ spoofDetState: spoofDetState, date: new Date() });
          return;
        }
      },
    );
  } catch (e) {
    res.json({});
  }
});

export default router;
