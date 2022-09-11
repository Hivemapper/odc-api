import { Router } from 'express';

const router = Router();

router.post('/drops', (req, res) => {
  // TBD, done via App for now
  res.json({
    drops: 0,
  });
});

export default router;
