import { Router } from 'express';
import {
  listAdAccounts,
  selectAdAccount,
  fbStatus,
} from '../controllers/workspaceController';
import { verifyToken } from '../middleware/auth';

const router = Router();

// Mounted at /api/workspace — all protected
router.get('/ad-accounts', verifyToken, listAdAccounts);
router.post('/select-ad-account', verifyToken, selectAdAccount);
router.get('/fb-status', verifyToken, fbStatus);

export default router;
