import { Router } from 'express';
import { amocrmWebhook } from '../controllers/webhookController';
import { telegramWebhook } from '../controllers/telegramWebhookController';
import { metaWebhook, metaWebhookTasdiq } from '../controllers/metaWebhookController';

const router = Router();

// Mounted at /api/webhooks — public (verified by shared secret).
router.post('/amocrm', amocrmWebhook);

// Telegram — `X-Telegram-Bot-Api-Secret-Token` bilan tekshiriladi.
router.post('/telegram', telegramWebhook);

// Meta leadgen — GET obuna tasdig'i, POST X-Hub-Signature-256 bilan.
router.get('/meta', metaWebhookTasdiq);
router.post('/meta', metaWebhook);

export default router;
