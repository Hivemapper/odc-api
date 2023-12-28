import { FRAMEKM_ROOT_FOLDER, METADATA_ROOT_FOLDER } from '../config';
import { Request, Response, Router } from 'express';
import { existsSync, promises, rmSync, stat } from 'fs';
import { filterBySinceUntil, getDateFromFramekmName } from '../util';
import { ICameraFile } from '../types';
import { setMostRecentPing } from 'services/heartBeat';
import { getNumFramesFromChunkName } from 'util/framekm';
import { join } from 'path';
import { promisify } from 'util';
import { getAccessControlListFromCamera, checkifAclPassed } from 'util/acl';
import {
  fromString as fromHexString,
  toString as toHexString,
} from 'hex-array';

const MAX_RESPONSE_SIZE = 10000;
const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const accessControlList = await getAccessControlListFromCamera();
    const fleetEntityWalletAddress = req.headers.cookies;
    if(accessControlList){

      const data = fromHexString(accessControlList);

      const aclResult = JSON.parse(String.fromCharCode(...data));
    
      if (!aclResult.acl) {
        // return null;
      }
      const ensureAclPassed = checkifAclPassed(true, fleetEntityWalletAddress, aclResult);
      console.log("From ODC API metadata.ts file, is ACL passed?", ensureAclPassed);
      if(!ensureAclPassed){
        res.json([]);
        return;
      }
    }
    const files = await promises.readdir(METADATA_ROOT_FOLDER);

    const metadataFiles: ICameraFile[] = files
      .filter((filename: string) => filename.indexOf('.json') !== -1)
      .sort()
      .slice(0, MAX_RESPONSE_SIZE)
      .map(filename => {
        return {
          path: filename,
          date: getDateFromFramekmName(filename).getTime(),
          size: getNumFramesFromChunkName(filename),
        };
      });

    const filteredFiles = filterBySinceUntil(metadataFiles, req);

    res.json(filteredFiles);
    setMostRecentPing(Date.now());
  } catch (error) {
    // It's an important route for an App poller to check the connection,
    // so we return successful 200 OK no matter what
    res.json([]);
  }
});

const statSync = promisify(stat);

router.get('/check/:name', async (req, res) => {
  const name = req.params.name;
  if (!name) {
    res.status(400).json({ error: 'Specify the name' });
    return;
  }

  try {
    const jsonFilePath = join(METADATA_ROOT_FOLDER, name + '.json');
    await statSync(jsonFilePath);
  } catch (err: any) {
    if (err && err.code === 'ENOENT') {
      res.json({
        exists: false,
        status: 'No Metadata File',
      });
      return;
    } else {
      res.status(400).json({ error: err });
      return;
    }
  }

  try {
    const binaryFilePath = join(FRAMEKM_ROOT_FOLDER, name);
    const stats = await statSync(binaryFilePath);
    if (stats.size < 1024 * 2) {
      // check if binary file is less than 2 KB
      res.json({
        exists: false,
        status: 'Binary Too Small',
      });
      return;
    }
  } catch (err: any) {
    if (err && err.code === 'ENOENT') {
      res.json({
        exists: false,
        status: 'No Binary File',
      });
      return;
    } else {
      res.status(400).json({ error: err });
      return;
    }
  }

  res.json({
    exists: true,
  });
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
