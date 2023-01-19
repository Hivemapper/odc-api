import { updateFirmware } from 'config';
import { Request, Response, Router } from 'express';
import { switchToFirmwareUpdate } from 'services/heartBeat';
const router = Router();

router.get('/', updateFirmware);

router.get('/start', async (req: Request, res: Response) => {
  switchToFirmwareUpdate(true);
  res.json({
    status: 'started',
  });
});

router.get('/finish', async (req: Request, res: Response) => {
  switchToFirmwareUpdate(false);
  res.json({
    status: 'finished',
  });
});

export default router;
