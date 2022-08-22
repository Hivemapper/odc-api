import { updateCameraConfig } from '../config';
import { Router, Request, Response } from 'express';
const router = Router();

router.get('/camera', async (req: Request, res: Response) => {
  try {
    updateCameraConfig(JSON.parse(req.body.payload));
    res.json({
      output: 'in progress',
    });
  } catch (error: any) {
    res.json({ error });
  }
});

export default router;
