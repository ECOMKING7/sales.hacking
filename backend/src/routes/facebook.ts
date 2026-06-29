import { Router } from 'express';
import { connect, callback } from '../controllers/facebookController';
import { verifyToken } from '../middleware/auth';

const router = Router();

// Mounted at /api/auth/facebook
router.get('/connect', verifyToken, connect);
router.get('/callback', callback);

export default router;
