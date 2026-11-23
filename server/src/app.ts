import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import type { Container } from './container';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimits';
import { buildApiRouter } from './routes';

export function createApp(container: Container, allowedOrigins: string[]): Express {
  const app = express();

  app.set('trust proxy', 1); // Railway termina TLS en un proxy
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  /** Salud del servicio, sin exponer configuración. */
  app.get('/health', (_req, res) => {
    const db = mongoose.connection.readyState === 1 ? 'up' : 'down';
    res.status(db === 'up' ? 200 : 503).json({ status: db === 'up' ? 'ok' : 'degraded', db, uptime: Math.round(process.uptime()) });
  });

  app.use('/api', apiLimiter, buildApiRouter(container));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
