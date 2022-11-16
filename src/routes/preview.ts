import { PREVIEW_ROUTE } from 'config';
import { Request, Response, Router } from 'express';
import { getPreviewStatus } from 'services/heartBeat';
import { startPreview, stopPreview } from 'util/preview';
const router = Router();

router.get('/start', async (req: Request, res: Response) => {
  try {
    await startPreview();

    res.json({
      status: 'started',
      route: PREVIEW_ROUTE,
    });
  } catch (error: unknown) {
    res.json({
      error,
    });
  }
});

router.get('/status', async (req: Request, res: Response) => {
  const isStarted = getPreviewStatus();
  res.json({
    status: isStarted ? 'started' : 'stopped',
  });
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
