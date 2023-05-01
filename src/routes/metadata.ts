import { METADATA_ROOT_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import { existsSync, readdirSync, rmSync } from 'fs';
import { filterBySinceUntil, getDateFromFramekmName } from '../util';
import { ICameraFile } from '../types';
import { setMostRecentPing } from 'services/heartBeat';
import { getLockTime } from 'util/lock';
import { Instrumentation } from 'util/instrumentation';

const router = Router();

let firstFileFetched = false;

router.get('/', async (req: Request, res: Response) => {
  try {
    const files = readdirSync(METADATA_ROOT_FOLDER);

    const metadataFiles: ICameraFile[] = files
      .filter((filename: string) => filename.indexOf('.json') !== -1)
      .map(filename => {
        return {
          path: filename,
          date: getDateFromFramekmName(filename).getTime(),
        };
      });

    const filteredFiles = filterBySinceUntil(metadataFiles, req);

    if (!firstFileFetched && getLockTime().lockTime && filteredFiles.length) {
      firstFileFetched = true;
      Instrumentation.add({
        event: 'DashcamFetchedFirstGpsFile',
      });
    }

    res.json(filteredFiles);
    setMostRecentPing(Date.now());
  } catch (error) {
    // It's an important route for an App poller to check the connection,
    // so we return successful 200 OK no matter what
    res.json([]);
  }
});

router.delete('/:name', async (req: Request, res: Response) => {
  try {
    const name = req.params.name;
    if (existsSync(METADATA_ROOT_FOLDER + '/' + name)) {
      rmSync(METADATA_ROOT_FOLDER + '/' + name);
    }
    res.json({
      deleted: true,
    });
  } catch (error) {
    res.json({ error });
  }
});

export default router;