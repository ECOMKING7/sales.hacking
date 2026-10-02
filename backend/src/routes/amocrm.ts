import { Router } from 'express';
import { connect, callback, manualConnect, claimInstall, disconnectHook } from '../controllers/amocrmController';
import { verifyToken } from '../middleware/auth';

const router = Router();

// Mounted at /api/auth/amocrm
router.get('/connect', verifyToken, connect);
router.get('/callback', callback);
// Xususiy integratsiya: "Код авторизации" ni qo'lda kiritish yo'li.
router.post('/manual', verifyToken, manualConnect);
// amoMarket'dan o'rnatilgan integratsiyani workspace'ga biriktirish.
router.post('/claim', verifyToken, claimInstall);

// amoCRM "хук об отключении" — imzo bilan himoyalangan, token talab qilmaydi.
router.get('/disconnect', disconnectHook);
router.post('/disconnect', disconnectHook);

export default router;
