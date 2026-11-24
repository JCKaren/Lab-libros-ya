import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import type { Container } from './container';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimits';
import { buildApiRouter } from './routes';

export function createApp(container: Container, allowedOrigins: string[], trustProxy: number): Express {
  const app = express();

  // Railway termina TLS en un proxy (1 salto). Sin proxy debe ser 0 (ver TRUST_PROXY).
  app.set('trust proxy', trustProxy);
  app.disable('x-powered-by');
  app.use(helmet());
  // Autenticación por cabecera Bearer, no por cookies: no se necesitan credenciales CORS.
  app.use(cors({ origin: allowedOrigins, credentials: false }));
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
