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
  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CLIENT_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  PAYMENT_PROVIDER: z.enum(['paypal', 'mock']).default('paypal'),
  PAYPAL_CLIENT_ID: z.string().default(''),
  PAYPAL_CLIENT_SECRET: z.string().default(''),
  PAYPAL_API_BASE: z.string().url().default('https://api-m.sandbox.paypal.com'),
  CURRENCY: z.string().length(3).default('USD'),
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

export const env = {
  ...data,
  /** Permite varios orígenes separados por coma (ej. local + Railway). */
  clientOrigins: data.CLIENT_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
  isProduction: data.NODE_ENV === 'production',
} as const;
