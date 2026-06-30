import { Router } from 'express';
import { connect, callback } from '../controllers/amocrmController';
import { verifyToken } from '../middleware/auth';

const router = Router();

// Mounted at /api/auth/amocrm
router.get('/connect', verifyToken, connect);
router.get('/callback', callback);

export default router;
