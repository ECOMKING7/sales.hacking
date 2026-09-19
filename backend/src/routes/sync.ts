import { Router } from 'express';
import {
  trigger,
  status,
  cronSync,
  amocrmImport,
  kunlikBackfill,
} from '../controllers/syncController';
import { verifyToken } from '../middleware/auth';

const router = Router();

// /api/sync ga ulangan

// Foydalanuvchi qo'lda bosadigan sync — JWT talab qiladi.
router.post('/trigger', verifyToken, trigger);
router.get('/status', verifyToken, status);
// amoCRM tarixini import qilish — bir chaqiruvda bitta sahifa.
router.post('/amocrm-import', verifyToken, amocrmImport);
// Kunlik FB tarixini to'ldirish — bir chaqiruvda 30 kun.
router.post('/kunlik-backfill', verifyToken, kunlikBackfill);

// Tashqi rejalashtiruvchi (cron-job.org) uchun — JWT emas, CRON_SECRET.
// GET ham qabul qilinadi, chunki ba'zi bepul cron xizmatlari faqat GET yuboradi.
router.post('/cron', cronSync);
router.get('/cron', cronSync);

export default router;
