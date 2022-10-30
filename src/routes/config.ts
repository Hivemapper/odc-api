import { Router, Request, Response } from 'express';
import { setCameraConfig } from 'util/index';
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

export default router;
