import { Router } from 'express';
import { amocrmWebhook } from '../controllers/webhookController';

const router = Router();

// Mounted at /api/webhooks — public (verified by shared secret).
router.post('/amocrm', amocrmWebhook);

export default router;
