import { Router } from 'express';
import { trigger, status } from '../controllers/syncController';
import { verifyToken } from '../middleware/auth';

const router = Router();

// Mounted at /api/sync — all protected
router.post('/trigger', verifyToken, trigger);
router.get('/status', verifyToken, status);

export default router;
