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
import { startSyncCron } from './jobs/syncJob';

const app: Application = express();
const PORT = process.env.PORT || 4000;
const isProd = process.env.NODE_ENV === 'production';

// Behind Railway's proxy — needed for correct req.ip / rate limiting.
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(compression());
// In production, restrict CORS to the configured frontend origin.
// (The pixel router opens CORS to '*' for its own routes.)
app.use(
  cors(isProd && process.env.FRONTEND_URL ? { origin: process.env.FRONTEND_URL } : {})
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'Attribution Platform API' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth/facebook', facebookRoutes);
app.use('/api/auth/amocrm', amocrmRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/attribution', attributionRoutes);
app.use('/api/pixel', pixelRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Error handler. Pixel endpoints must never surface an error to the client
// (e.g. malformed JSON from a customer site) — always 200.
app.use((err: Error & { status?: number }, req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/pixel')) {
    res.status(200).json({ success: true, eventId: null });
    return;
  }
  if (res.headersSent) {
    next(err);
    return;
  }
  console.error('Unhandled error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Schedule automatic FB sync every 15 minutes.
  startSyncCron();
});

export default app;
