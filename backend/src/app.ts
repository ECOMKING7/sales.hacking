import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';

dotenv.config();

import authRoutes from './routes/auth';
import facebookRoutes from './routes/facebook';
import amocrmRoutes from './routes/amocrm';
import workspaceRoutes from './routes/workspace';
import syncRoutes from './routes/sync';
import webhookRoutes from './routes/webhooks';
import attributionRoutes from './routes/attribution';
import pixelRoutes from './routes/pixel';
import dashboardRoutes from './routes/dashboard';

/**
 * Express ilovasi. Bu fayl SERVER OCHMAYDI va cron ISHGA TUSHIRMAYDI —
 * shuning uchun uni ham doimiy server (Railway), ham serverless (Vercel)
 * ishlata oladi.
 *
 *   src/index.ts   → app.listen() + cron   (Railway, lokal dev)
 *   api/index.ts   → export default app    (Vercel serverless)
 */

// Xavfsizlik to'ri: adashgan async xato (masalan ixtiyoriy navbatdagi Redis
// ECONNREFUSED) butun API ni yiqitmasin.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

const app: Application = express();
const isProd = process.env.NODE_ENV === 'production';

// Proksi ortida (Railway / Vercel) — to'g'ri req.ip va rate limiting uchun.
app.set('trust proxy', 1);

app.use(helmet());
app.use(compression());

/**
 * CORS. Bir nechta frontend manzili bo'lishi mumkin (Vercel preview deploy'lari),
 * shuning uchun FRONTEND_URL vergul bilan ajratilgan ro'yxatni qabul qiladi.
 * Pixel marshruti o'z ichida CORS ni '*' ga ochadi.
 */
const allowedOrigins = (process.env.FRONTEND_URL ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * `Retry-After` — CORS'ning standart ro'yxatida yo'q, shuning uchun
 * brauzer uni JS'dan yashiradi. Login to'sig'i 429 bilan bu sarlavhani
 * yuboradi, lekin frontend uni o'qiy olmasdi va "necha daqiqa kutish
 * kerak" deb ko'rsatishga ma'lumot yo'q edi.
 */
const EXPOSED_HEADERS = ['Retry-After'];

app.use(
  cors(
    isProd && allowedOrigins.length
      ? {
          exposedHeaders: EXPOSED_HEADERS,
          origin: (origin, cb) => {
            // origin yo'q = server-to-server yoki curl — ruxsat.
            if (!origin) return cb(null, true);
            if (allowedOrigins.includes(origin)) return cb(null, true);
            // Vercel preview: <loyiha>-<hash>-<jamoa>.vercel.app
            if (process.env.ALLOW_VERCEL_PREVIEWS === 'true' && /\.vercel\.app$/.test(new URL(origin).hostname)) {
              return cb(null, true);
            }
            return cb(new Error('Not allowed by CORS'));
          },
        }
      : { exposedHeaders: EXPOSED_HEADERS }
  )
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/auth/facebook', facebookRoutes);
app.use('/api/auth/amocrm', amocrmRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/attribution', attributionRoutes);
app.use('/api/pixel', pixelRoutes);
app.use('/api/dashboard', dashboardRoutes);

/**
 * Topilmagan marshrut. Express'ning standart javobi HTML sahifa bo'lib,
 * unda "Cannot GET /..." va server turi ko'rinadi — bu keraksiz ma'lumot.
 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

/**
 * Xato ishlovchisi.
 *
 * ⚠ XAVFSIZLIK: ilgari bu yerda `err.message` to'g'ridan-to'g'ri mijozga
 * qaytarilardi. Postgres xatosi esa ICHKI NOMLARNI oshkor qiladi:
 *   column "amocrm_won_pairs" does not exist
 *   relation "capi_events" does not exist
 *   duplicate key value violates unique constraint "capi_events_unique"
 * Ya'ni tashqi odam bir necha so'rov bilan sxemani chizib olishi mumkin.
 * Bugun Vena AI'da aynan shu yo'l bilan ichki jadval nomlarini ko'rdim.
 *
 * Endi qoida: 4xx — bizning ataylab yozgan matnimiz, mijozga kerak.
 * 5xx — umumiy matn; haqiqiy sabab faqat server log'ida.
 *
 * Pixel endpoint'lari mijoz saytiga hech qachon xato qaytarmaydi.
 */
app.use((err: Error & { status?: number }, req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/pixel')) {
    res.status(200).json({ success: true, eventId: null });
    return;
  }
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
  console.error(`Unhandled error [${status}] ${req.method} ${req.path}:`, err.message);

  res.status(status).json({
    error: status < 500 ? err.message || 'Bad request' : 'Internal error',
  });
});

export default app;
