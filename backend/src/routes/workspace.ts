import { Router } from 'express';
import {
  listAdAccounts,
  selectAdAccount,
  fbStatus,
  invite,
  members,
  removeMember,
  usage,
  createWorkspace,
  switchWorkspace,
  listWorkspaces,
} from '../controllers/workspaceController';
import {
  status as amocrmStatus,
  listPipelines as amocrmListPipelines,
  savePipeline as amocrmSavePipeline,
  listFields as amocrmListFields,
  saveLeadIdField as amocrmSaveLeadIdField,
} from '../controllers/amocrmController';
import {
  status as metaCapiStatus,
  save as metaCapiSave,
} from '../controllers/metaCapiController';
import { verifyToken } from '../middleware/auth';

const router = Router();

// Mounted at /api/workspace — all protected

// Facebook
router.get('/ad-accounts', verifyToken, listAdAccounts);
router.get('/fb-ad-accounts', verifyToken, listAdAccounts); // lists ALL accessible accounts
router.post('/select-ad-account', verifyToken, selectAdAccount);
router.get('/fb-status', verifyToken, fbStatus);

// AmoCRM
router.get('/amocrm-status', verifyToken, amocrmStatus);
router.get('/amocrm-pipelines', verifyToken, amocrmListPipelines);
router.post('/amocrm-pipeline', verifyToken, amocrmSavePipeline);
// Maydon tahlili: Meta Lead ID qaysi maydonda (faqat o'qish) + tanlovni saqlash
router.get('/amocrm-fields', verifyToken, amocrmListFields);
router.post('/amocrm-lead-id-field', verifyToken, amocrmSaveLeadIdField);

// Meta Conversions API (token bu yerdan o'tmaydi — faqat .env da, §4.1)
router.get('/meta-capi', verifyToken, metaCapiStatus);
router.post('/meta-capi', verifyToken, metaCapiSave);

// Workspace management
router.get('/list', verifyToken, listWorkspaces);
router.post('/create', verifyToken, createWorkspace);
router.post('/switch/:id', verifyToken, switchWorkspace);

// Team / SaaS
router.post('/invite', verifyToken, invite);
router.get('/members', verifyToken, members);
router.delete('/members/:userId', verifyToken, removeMember);
router.get('/usage', verifyToken, usage);

export default router;
