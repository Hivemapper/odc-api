import { Router } from 'express';
import { getDropsCount } from 'services/heartBeat';

const router = Router();

router.post('/drops', (req, res) => {
  res.json({
    drops: getDropsCount(),
  });
});

export default router;
