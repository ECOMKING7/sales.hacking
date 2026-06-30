import { Router } from 'express';
import {
  listAdAccounts,
  selectAdAccount,
  fbStatus,
} from '../controllers/workspaceController';
import {
  status as amocrmStatus,
  listPipelines as amocrmListPipelines,
  savePipeline as amocrmSavePipeline,
} from '../controllers/amocrmController';
import { verifyToken } from '../middleware/auth';

const router = Router();

// Mounted at /api/workspace — all protected

// Facebook
router.get('/ad-accounts', verifyToken, listAdAccounts);
router.post('/select-ad-account', verifyToken, selectAdAccount);
router.get('/fb-status', verifyToken, fbStatus);

// AmoCRM
router.get('/amocrm-status', verifyToken, amocrmStatus);
router.get('/amocrm-pipelines', verifyToken, amocrmListPipelines);
router.post('/amocrm-pipeline', verifyToken, amocrmSavePipeline);

export default router;
