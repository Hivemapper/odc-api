import { Router, Request, Response } from 'express';
import { Camera4KResolutionConfig } from 'types';
import { setCameraConfig, getCameraConfig } from 'util/index';
import { ICameraResolutionConfig, Camera2KResolutionConfig, Camera1KResolutionConfig } from 'types/index';

const router = Router();

router.post('/cameraconfig', async (req: Request, res: Response) => {
  try {
    setCameraConfig(req.body.config);
    res.json({
      output: 'done',
    });
  } catch (error: any) {
    res.json({ error });
  }
});

router.put('/resolution', async (req: Request, res: Response) => {
  try {
    let resolution: ICameraResolutionConfig | null = null;
    if (req.body.resolution === '4K') {
      resolution = Camera4KResolutionConfig;
    } else if (req.body.resolution === '2K') {
      resolution = Camera2KResolutionConfig;
    } else if (req.body.resolution === '1K') {
      resolution = Camera1KResolutionConfig;
    } else {
      res.status(400).json({
        error: 'Resolutions supported: 4K, 2K, 1K',
      })
      return;
    }
    const config = getCameraConfig();
    config.camera.encoding = {
      ...config.camera.encoding,
      ...resolution || {},
    }
    setCameraConfig(config);
    res.status(200).json({ output: 'done' })
  } catch (error) {
    res.status(400).json({ error });
  }
});

export default router;
