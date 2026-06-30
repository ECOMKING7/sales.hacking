import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

dotenv.config();

import authRoutes from './routes/auth';
import facebookRoutes from './routes/facebook';
import amocrmRoutes from './routes/amocrm';
import workspaceRoutes from './routes/workspace';
import syncRoutes from './routes/sync';
import webhookRoutes from './routes/webhooks';
import { startSyncCron } from './jobs/syncJob';

const app: Application = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'attribution-platform-backend' });
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Schedule automatic FB sync every 15 minutes.
  startSyncCron();
});

export default app;
