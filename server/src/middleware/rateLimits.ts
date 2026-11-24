import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const message = { error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos, espera unos minutos' } };

/**
 * Protección contra fuerza bruta en login/registro. El límite es configurable
 * (AUTH_RATE_LIMIT) para subirlo solo durante una ventana de pruebas automatizadas.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.AUTH_RATE_LIMIT,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message,
});

/** Freno a la enumeración de correos y a la creación masiva de cuentas. */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.REGISTER_RATE_LIMIT,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message,
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message,
});
