import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import {
  overview,
  campaigns,
  campaignAdsets,
  adsetAds,
  topCampaigns,
  topAdsets,
  topAds,
  wonDeals,
  leadDetail,
} from '../controllers/dashboardController';

const router = Router();

// Mounted at /api/dashboard — all protected
router.use(verifyToken);

router.get('/overview', overview);
router.get('/campaigns', campaigns);
router.get('/campaigns/:id/adsets', campaignAdsets);
router.get('/adsets/:id/ads', adsetAds);
router.get('/top-campaigns', topCampaigns);
router.get('/top-adsets', topAdsets);
router.get('/top-ads', topAds);
router.get('/won-deals', wonDeals);
router.get('/leads/:id', leadDetail);

export default router;
