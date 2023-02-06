import { Router, Request, Response } from 'express';
import { setCameraConfig, getCameraConfig } from 'util/index';
const router = Router();

router.post('/cameraconfig', async (req: Request, res: Response) => {
  try {
    await setCameraConfig(req.body.config);
    res.json({
      output: 'done',
    });
  } catch (error: any) {
    res.json({ error });
  }
});

router.get('/cameraconfig', async (req: Request, res: Response) => {
  try {
    const config = await getCameraConfig();
    res.json(config);
  } catch (error: unknown) {
    res.json({ error });
  }
});

export default router;
