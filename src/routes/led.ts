import { Router } from 'express';
import { setIsLedControlledByDashcam } from 'services/heartBeat';
import { updateLED } from 'util/led';

const router = Router();

router.post('/update', (req, res) => {
  updateLED(req.body.camera, req.body.gps, req.body.app);
  res.json({
    done: true,
  });
});

router.get('/auto', (req, res) => {
  setIsLedControlledByDashcam(true);
  res.json({
    done: true,
  });
});

router.get('/manual', (req, res) => {
  setIsLedControlledByDashcam(false);
  res.json({
    done: true,
  });
});

export default router;
