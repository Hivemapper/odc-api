import { Request, Response, Router } from 'express';
import { startPreview, stopPreview } from 'util/preview';
const router = Router();

router.get('/start', async (req: Request, res: Response) => {
  try {
    await startPreview();

    res.json({
      status: 'started',
    });
  } catch (error: unknown) {
    res.json({
      error,
    });
  }
});

router.get('/stop', async (req: Request, res: Response) => {
  try {
    await stopPreview();

    res.json({
      status: 'stopped',
    });
  } catch (error: unknown) {
    res.json({
      error,
    });
  }
});

export default router;
