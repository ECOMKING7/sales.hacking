import { Router } from 'express';
import { amocrmWebhook } from '../controllers/webhookController';
import { telegramWebhook } from '../controllers/telegramWebhookController';

const router = Router();

// Mounted at /api/webhooks — public (verified by shared secret).
router.post('/amocrm', amocrmWebhook);

// Telegram — `X-Telegram-Bot-Api-Secret-Token` bilan tekshiriladi.
router.post('/telegram', telegramWebhook);

export default router;
