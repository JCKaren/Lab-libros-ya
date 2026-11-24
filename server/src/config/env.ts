import 'dotenv/config';
import { z } from 'zod';

/**
 * Configuración validada al arrancar: si falta una variable crítica el
 * proceso falla de inmediato con un mensaje claro (sin imprimir secretos).
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI es obligatoria'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres aleatorios'),
  JWT_EXPIRES_IN: z.string().default('2h'),
  CLIENT_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  PAYMENT_PROVIDER: z.enum(['paypal', 'mock']).default('paypal'),
  PAYPAL_CLIENT_ID: z.string().default(''),
  PAYPAL_CLIENT_SECRET: z.string().default(''),
  PAYPAL_API_BASE: z.string().url().default('https://api-m.sandbox.paypal.com'),
  CURRENCY: z.string().length(3).default('USD'),
  /** Intentos de login/registro por IP cada 15 min. */
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).max(200).default(20),
  /** Registros por IP cada hora. */
  REGISTER_RATE_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  /**
   * Saltos de proxy de confianza para leer la IP real (X-Forwarded-For).
   * Railway usa 1. Sin proxy debe ser 0, o cualquiera podría falsear su IP y evadir los límites.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`[config] Variables de entorno inválidas:\n${problems}`);
  process.exit(1);
}

const data = parsed.data;

if (data.NODE_ENV === 'production' && data.PAYMENT_PROVIDER === 'mock') {
  console.error('[config] PAYMENT_PROVIDER=mock no está permitido en producción');
  process.exit(1);
}

if (data.PAYMENT_PROVIDER === 'paypal' && (!data.PAYPAL_CLIENT_ID || !data.PAYPAL_CLIENT_SECRET)) {
  console.error('[config] PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET son obligatorios con PAYMENT_PROVIDER=paypal');
  process.exit(1);
}

if (data.AUTH_RATE_LIMIT > 20) {
  console.warn(`[config] AUTH_RATE_LIMIT=${data.AUTH_RATE_LIMIT} está por encima del valor seguro (20). Bájalo al terminar las pruebas.`);
}

export const env = {
  ...data,
  trustProxy: data.TRUST_PROXY ?? (data.NODE_ENV === 'production' ? 1 : 0),
  /** Permite varios orígenes separados por coma (ej. local + Railway). */
  clientOrigins: data.CLIENT_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
  isProduction: data.NODE_ENV === 'production',
} as const;
