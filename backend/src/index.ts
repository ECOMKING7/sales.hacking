import app from './app';
import { startSyncCron } from './jobs/syncJob';

/**
 * Doimiy server rejimi — Railway va lokal dev uchun.
 * Vercel bu faylni UMUMAN ishlatmaydi (u api/index.ts ni chaqiradi),
 * shuning uchun node-cron faqat shu yerda turadi.
 */

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Serverless muhitda cron ishlamaydi — funksiya so'rovlar orasida yashamaydi.
  // U yerda sync tashqi tetik orqali keladi: POST /api/sync/cron
  if (process.env.VERCEL) {
    console.log('Vercel aniqlandi — ichki cron ishga tushirilmadi.');
    return;
  }
  if (process.env.DISABLE_SYNC_CRON === 'true') {
    console.log('DISABLE_SYNC_CRON=true — ichki cron o\'chirilgan.');
    return;
  }

  startSyncCron();
  console.log('Sync cron ishga tushdi: har 15 daqiqada.');
});

export default app;
