import { Router } from 'express';
import { trigger, status, cronSync } from '../controllers/syncController';
import { verifyToken } from '../middleware/auth';

const router = Router();

// /api/sync ga ulangan

// Foydalanuvchi qo'lda bosadigan sync — JWT talab qiladi.
router.post('/trigger', verifyToken, trigger);
router.get('/status', verifyToken, status);

// Tashqi rejalashtiruvchi (cron-job.org) uchun — JWT emas, CRON_SECRET.
// GET ham qabul qilinadi, chunki ba'zi bepul cron xizmatlari faqat GET yuboradi.
router.post('/cron', cronSync);
router.get('/cron', cronSync);

export default router;
