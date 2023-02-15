import { switchToAP, switchToP2P } from 'config';
import { Router } from 'express';

const router = Router();

router.post('/p2p', (req, res) => {
  switchToP2P(req, res);
  res.json({
    done: true,
  });
});

router.post('/ap', (req, res) => {
  switchToAP(req, res);
  res.json({
    done: true,
  });
});

export default router;
