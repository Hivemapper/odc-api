import { Router, Request, Response } from 'express';
import { ICameraConfig } from 'types';
import {
  setCameraConfig,
  getCameraConfig,
  setCameraResolution,
} from 'util/index';
import { Instrumentation } from 'util/instrumentation';
import { getConfig, loadConfig } from 'util/motionModel';
const router = Router();

router.get('/motionmodel', async (req: Request, res: Response) => {
  try {
    res.json(getConfig());
  } catch (error: unknown) {
    res.json({ error });
  }
});

router.post('/motionmodel', async (req: Request, res: Response) => {
  try {
    if (req?.body?.config) loadConfig(req.body.config, true);
    res.json({
      output: 'done',
    });
  } catch (error: any) {
    res.json({ error });
  }
});

// New version of camera config API:
router.post('/camera', async (req: Request, res: Response) => {
  try {
    await setCameraConfig(req.body.config);
    res.json({
      output: 'done',
    });
  } catch (error: any) {
    res.json({ error });
  }
});

router.get('/camera', async (req: Request, res: Response) => {
  try {
    const config = await getCameraConfig();
    res.json(config);
  } catch (error: unknown) {
    res.json({ error });
  }
});

// TODO: deprecated, remove once refactored on the App
let dummyConfig: ICameraConfig = {
  recording: {
    directory: {
      prefix: '',
      output: '/mnt/data/pic/',
      minfreespace: 64000000,
      output2: '/media/usb0/recording/',
      minfreespace2: 32000000,
      maxusedspace: 16106127360,
    },
  },
  camera: {
    encoding: {
      fps: 10,
      width: 2048,
      height: 1536,
      codec: 'mjpeg',
      quality: 90,
    },
    adjustment: {
      hflip: false,
      vflip: false,
      denoise: 'off',
      rotation: 180,
    },
  },
};

router.post('/2k', async (req: Request, res: Response) => {
  try {
    setCameraResolution('2K');
    res.json({
      output: 'done',
    });
    Instrumentation.add({
      event: 'DashcamResolutionUpdated',
      message: '2K',
    });
  } catch (error: any) {
    res.json({ error });
  }
});

router.post('/4k', async (req: Request, res: Response) => {
  try {
    setCameraResolution('4K');
    res.json({
      output: 'done',
    });
    Instrumentation.add({
      event: 'DashcamResolutionUpdated',
      message: '4K',
    });
  } catch (error: any) {
    res.json({ error });
  }
});

router.post('/cameraconfig', async (req: Request, res: Response) => {
  try {
    dummyConfig = req.body.config;
    res.json({
      output: 'done',
    });
  } catch (error: any) {
    res.json({ error });
  }
});

router.get('/cameraconfig', async (req: Request, res: Response) => {
  try {
    res.json(dummyConfig);
  } catch (error: unknown) {
    res.json({ error });
  }
});

export default router;
