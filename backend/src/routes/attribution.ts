import { Router } from 'express';
import { reprocess } from '../controllers/attributionController';
import { verifyToken } from '../middleware/auth';

const router = Router();

// Mounted at /api/attribution — protected
router.post('/reprocess/:leadId', verifyToken, reprocess);

export default router;
