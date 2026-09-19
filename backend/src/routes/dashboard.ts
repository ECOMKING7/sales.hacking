import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { requireFeature } from '../middleware/planLimits';
import {
  overview,
  campaigns,
  campaignAdsets,
  adsetAds,
  topCampaigns,
  topAdsets,
  topAds,
  wonDeals,
  exportWonDeals,
  leadDetail,
  adsets,
  ads,
  entityIds,
} from '../controllers/dashboardController';
import { funnel, demoStatus } from '../controllers/funnelController';
import { atribusiyaTashxis, formKashfiyot } from '../controllers/tashxisController';

const router = Router();

// Mounted at /api/dashboard — all protected
router.use(verifyToken);

router.get('/overview', overview);
// Zanjir qayerda uzilgan — faqat o'qiydi, hech narsa o'zgartirmaydi.
router.get('/atribusiya-tashxis', atribusiyaTashxis);
// Instant Form -> reklama xaritasi qurilishi mumkinmi (B yo'li tajribasi).
router.get('/form-kashfiyot', formKashfiyot);
// Ad → lid → sifatli lid → sotuv → pul, bitta jadvalda
router.get('/funnel', funnel);
// Demo ma'lumot bormi — UI ogohlantirish chizig'i uchun
router.get('/demo-status', demoStatus);
router.get('/campaigns', campaigns);
// Ko'p tanlash: ota-ona ro'yxati bo'yicha filtr
router.get('/entity-ids', entityIds);
router.get('/adsets', adsets);
router.get('/ads', ads);
router.get('/campaigns/:id/adsets', campaignAdsets);
router.get('/adsets/:id/ads', adsetAds);
router.get('/top-campaigns', topCampaigns);
router.get('/top-adsets', topAdsets);
router.get('/top-ads', topAds);
router.get('/won-deals', wonDeals);
router.get('/won-deals/export', requireFeature('export'), exportWonDeals);
router.get('/leads/:id', leadDetail);

export default router;
