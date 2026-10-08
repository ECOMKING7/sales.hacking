import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import * as b from '../controllers/billingController';

const router = Router();

// Mounted at /api/billing
router.get('/', verifyToken, b.holat);
router.post('/payme/karta', verifyToken, b.paymeKarta);
router.post('/click/karta', verifyToken, b.clickKarta);
router.post('/click/tasdiq', verifyToken, b.clickTasdiq);
router.post('/obuna', verifyToken, b.obuna);
router.post('/avto', verifyToken, b.avto);
router.delete('/karta', verifyToken, b.kartaOchir);
router.post('/checkout', verifyToken, b.checkout);

// Payme serveri (Merchant API) — JWT emas, Basic auth (Paycom:<kalit>).
// Kassa sozlamasida "Endpoint URL": https://api.mcqueen.uz/api/billing/payme/merchant
router.all('/payme/merchant', b.paymeMerchantRpc);

// Tashqi rejalashtiruvchi (cron-job.org) — JWT emas, CRON_SECRET.
router.post('/cron', b.cron);

export default router;
