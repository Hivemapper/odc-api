import { Router } from 'express';
import FirmwareManager from 'util/firmware';
const router = Router();

const firmwareManager = new FirmwareManager();

router.get('/install', async (req, res) => {
  const firmwareFile = req?.body?.fileName || '';
  if(!firmwareFile) {
    res.json({
        output: "No firmware file provided",
    })
  }
  const resp = firmwareManager.installFirmware(firmwareFile);
  res.json(resp);
});

router.get('/progress', async (req, res) => {
  res.json({ isRunning: firmwareManager.getMessage(), errorSeen: firmwareManager.getErrorSeen() });
});

export default router;
