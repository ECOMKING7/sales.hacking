import { Router } from 'express';
import { connect, callback, manualConnect } from '../controllers/amocrmController';
import { verifyToken } from '../middleware/auth';

const router = Router();

// Mounted at /api/auth/amocrm
router.get('/connect', verifyToken, connect);
router.get('/callback', callback);
// Xususiy integratsiya: "Код авторизации" ni qo'lda kiritish yo'li.
router.post('/manual', verifyToken, manualConnect);

export default router;
