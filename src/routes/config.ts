import { updateCameraConfig } from '../config';
import { Router, Request, Response } from 'express';
const router = Router();

router.post('/camera', async (req: Request, res: Response) => {
  try {
    // updateCameraConfig(req.body.replace, req.body.path);
    res.json({
      output: 'in progress',
    });
  } catch (error: any) {
    res.json({ error });
  }
});

export default router;
