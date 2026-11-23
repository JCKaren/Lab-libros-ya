import { z } from 'zod';
import { BOOK_CATEGORIES, BOOK_FORMATS } from '../domain/catalog';
import { SHIPPING_STATUSES } from '../domain/orderStatus';
import { AppError } from '../utils/AppError';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Identificador inválido');

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(120),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});

export const updateProfileSchema = z.object({ name: z.string().trim().min(2).max(80) });

const localized = (max: number) => z.object({ es: z.string().trim().min(1).max(max), en: z.string().trim().min(1).max(max) });
const optionalUrl = z.url().max(500).or(z.literal('')).default('');

export const bookSchema = z.object({
  title: localized(150),
  author: z.string().trim().min(1).max(120),
  description: localized(600),
  category: z.enum(BOOK_CATEGORIES),
  format: z.enum(BOOK_FORMATS),
  isbn: z.string().trim().max(20).default(''),
  price: z
    .number()
    .positive()
    .max(10_000)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Máximo dos decimales'),
  stock: z.number().int().min(0).max(1_000_000),
  coverUrl: optionalUrl,
  downloadUrl: optionalUrl,
  active: z.boolean().default(true),
});

export const bookUpdateSchema = bookSchema.partial();

export const stockAdjustSchema = z.object({
  delta: z
    .number()
    .int()
    .refine((v) => v !== 0, 'El ajuste no puede ser 0')
    .refine((v) => Math.abs(v) <= 100_000, 'Ajuste demasiado grande'),
});

export const bookQuerySchema = z.object({
  category: z.enum(BOOK_CATEGORIES).optional(),
  format: z.enum(BOOK_FORMATS).optional(),
  q: z.string().trim().max(80).optional(),
  all: z.enum(['true', 'false']).optional(),
});

export const shippingAddressSchema = z.object({
  recipient: z.string().trim().min(2, 'Ingresa el nombre de quien recibe').max(100),
  line1: z.string().trim().min(5, 'Ingresa una dirección válida').max(200),
  city: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s-]{6,20}$/, 'Teléfono inválido'),
});

export const createOrderSchema = z.object({
  items: z
    .array(z.object({ bookId: objectId, quantity: z.number().int().min(1).max(20) }))
    .min(1, 'El carrito está vacío')
    .max(50),
  shippingAddress: shippingAddressSchema.optional(),
  notes: z.string().trim().max(300).optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(SHIPPING_STATUSES),
  carrier: z.string().trim().max(60).optional(),
  trackingNumber: z.string().trim().max(60).optional(),
});

export const idParamSchema = z.object({ id: objectId });

export const createPaymentSchema = z.object({ orderId: objectId });

export const capturePaymentSchema = z.object({
  orderId: objectId,
  providerOrderId: z.string().min(1).max(100),
});

/** Valida y devuelve datos tipados, o lanza 400 con el detalle por campo. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw AppError.badRequest('VALIDATION_ERROR', 'Datos inválidos', fields);
  }
  return result.data;
}
