import { Router, Request, Response } from 'express';
import { readFileSync, rmSync, writeFileSync } from 'fs';
import { CAMERA_BRIDGE_CONFIG_FILE_HASH, CAMERA_BRIDGE_CONFIG_FILE_OVERRIDE } from '../config';

import { isCameraBridgeServiceActive, restartCamera } from '../services/heartBeat';
import * as console from 'console';
import { getConfig, getFullConfig, setConfig, updateConfig } from 'sqlite/config';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const config = await getFullConfig();
    res.json(config);
  } catch (error: unknown) {
    res.json({ error });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    if (req?.body?.config) updateConfig(req.body.config);
    res.json({
      output: 'done',
    });
  } catch (e) {
    res.json({ e });
  }
});

router.get('/key/:name', async (req: Request, res: Response) => {
  try {
    const value = await getConfig(req.params.name);
    const response: any = {};
    response[req.params.name] = value;
    res.send(response);
  } catch (error) {
    res.status(500).send({ error });
  }
});

router.post('/key', async (req: Request, res: Response) => {
  try {
    if (req?.body?.name) {
      const { name, value } = req.body;
      await setConfig(name, value);
      res.send({
        [name]: value,
      });
    } else {
      res.send({
        error: 'format is { name, value }'
      })
    }
  } catch (error) {
    res.json({ error });
  }
});

router.get('/processing/toggle', async (req: Request, res: Response) => {
  try {
    const value = await getConfig('isProcessingEnabled');
    if (value) {
      await setConfig('isProcessingEnabled', false);
      res.send({
        processingSetTo: false,
      })
    } else {
      await setConfig('isProcessingEnabled', true);
      res.send({
        processingSetTo: true,
      })
    }
  } catch (error) {
    res.status(500).send({ error });
  }
});

/* TODO: deprecated, do not remove or enhance */
router.get('/motionmodel', async (req: Request, res: Response) => {
  try {
    const config = await getFullConfig();
    res.json(config);
  } catch (error: unknown) {
    res.json({ error });
  }
});

/* TODO: deprecated, do not remove or enhance */
router.post('/motionmodel', async (req: Request, res: Response) => {
  try {
    if (req?.body?.config) updateConfig(req.body.config);
    res.json({
      output: 'done',
    });
  } catch (e) {
    res.json({ e });
  }
});


router.post('/camera_bridge', async (req: Request, res: Response) => {
  console.log('POST: /camera_bridge: receiving config');
  try {

    const config_data = Buffer.from(req.body['data'], 'base64');
    writeFileSync(CAMERA_BRIDGE_CONFIG_FILE_OVERRIDE, config_data, {
      encoding: 'utf-8',
    });
    console.log('POST: /camera_bridge: config written to file');

    writeFileSync(CAMERA_BRIDGE_CONFIG_FILE_HASH, req.body.hash, { encoding: 'utf-8' });
    console.log('POST: /camera_bridge: config hash written to file');

    const active = await isCameraBridgeServiceActive();
    console.log('POST: /camera_bridge: camera bridge service active: ' + active);
    if (active) {
      restartCamera();
      console.log('POST: /camera_bridge: camera bridge service restarted');
    }
  } catch (e) {
    res.json({ err: e });
  }
  res.json({});
});

router.delete('/camera_bridge', async (req: Request, res: Response) => {
  console.log('DELETE: /camera_bridge: deleting config');
  try {

    rmSync(CAMERA_BRIDGE_CONFIG_FILE_OVERRIDE);
    console.log('DELETE: /camera_bridge: config file deleted');
  } catch (e) {
    console.log('DELETE: /camera_bridge: config file error: ' + e);
  }
  try {
    rmSync(CAMERA_BRIDGE_CONFIG_FILE_HASH);
    console.log('DELETE: /camera_bridge: config hash file deleted');
  } catch (e) {
    console.log('DELETE: /camera_bridge: config hash file error: ' + e);
  }

  try {
    const active = await isCameraBridgeServiceActive();
    console.log('POST: /camera_bridge: camera bridge service active: ' + active);
    if (active) {
      restartCamera();
      console.log('POST: /camera_bridge: camera bridge service restarted');
    }

  } catch (e) {
    res.json({ err: e });
  }
  res.json({});
});

router.get('/camera_bridge/hash', async (req: Request, res: Response) => {
  try {
    const hash = readFileSync(CAMERA_BRIDGE_CONFIG_FILE_HASH, { encoding: 'utf-8' });
    res.json({ hash: hash.trim() });
  } catch (error: unknown) {
    res.json({ error, hash: '' });
  }
});

export default router;
