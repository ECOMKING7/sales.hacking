import { Router } from 'express';
import cors from 'cors';
import { trackEvent, script, pixelGif } from '../controllers/pixelController';

const router = Router();

// Pixel endpoints are called from arbitrary customer websites — allow any origin.
router.use(cors({ origin: '*' }));

router.post('/event', trackEvent);
router.get('/script.js', script);
router.get('/1x1.gif', pixelGif);

export default router;
