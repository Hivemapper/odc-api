import { Router } from 'express';
import { updateLED } from 'util/led';

const router = Router();

router.post('/update', (req, res) => {
  updateLED(req.body.camera, req.body.gps, req.body.app);
  res.json({
    done: true,
  });
});

export default router;
