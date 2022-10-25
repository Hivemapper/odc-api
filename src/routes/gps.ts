import { GPS_LATEST_SAMPLE, GPS_ROOT_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import { readdirSync, readFile } from 'fs';

import { filterBySinceUntil, getDateFromFilename } from '../util';
import { ICameraFile } from '../types';
import { setMostRecentPing } from 'services/heartBeat';
import { exec, ExecException } from 'child_process';

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

    res.json(filterBySinceUntil(gpsFiles, req));
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
          sample = JSON.parse(data);
        }

        res.json(sample);
      },
    );
  } catch (e) {
    console.log(e);
    res.json({});
  }
});

router.get('/jamind', async (req: Request, res: Response) => {
  let jamInd = undefined
  try {
    exec(
      'ubxtool -p MON-RF | grep jamInd',
      { encoding: 'utf-8' },
      (error: ExecException | null, stdout: string) => {
        let output = error ? '' : stdout;
        output = ` noisePerMS 89 agcCnt 4212 jamInd 9 ofsI 19 magI 177 ofsQ 14 magQ 173`
        console.log('output', output)
        // get jamInd 
        const line = output.split("\n").shift() // we should only get one in the output
        console.log('line', line)
        if (!line) {
          console.log("jamInd not found")
          return
        }
        console.log(line)
        const parts = line.split(" ")
        console.log(parts)
        const jamIndIndex = parts.findIndex(
          elem => elem.indexOf("jamInd") !== -1,
        );
        console.log('jamInd Index', jamIndIndex)
        if (jamIndIndex !== -1) {
          jamInd = parts[jamIndIndex + 1]
          console.log("during jamInd existence check", jamInd)
          res.json({ jamInd: jamInd, date: new Date() })
        }
      }
    )
  } catch (e) {
    console.log(e);
    res.json({});
  }
});

export default router;
