import { Router } from 'express';
import {
  errorSeen,
  installFirmware,
  message,
  SUCCESS_MESSAGE,
} from 'util/firmware';
const router = Router();

router.get('/install', async (req, res) => {
  const firmwareFile = req?.body?.fileName || '';
  const resp = installFirmware(firmwareFile);
  res.json(resp);
});

router.get('/progress', async (req, res) => {
  res.json({ isRunning: message !== SUCCESS_MESSAGE, errorSeen });
});

export default router;
