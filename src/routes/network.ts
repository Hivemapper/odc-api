import { switchToAP, switchToP2P } from '../config';
import { Router } from 'express';
const router = Router();

router.get('/p2p', switchToP2P);
router.get('/ap', switchToAP);

export default router;
