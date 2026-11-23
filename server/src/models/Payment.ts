import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { PAYMENT_STATUSES } from '../domain/orderStatus';

/** Registro de pago. Nunca se guardan datos de tarjeta: solo identificadores del proveedor. */
const paymentSchema = new Schema(
  {
    order: { type: Types.ObjectId, ref: 'Order', required: true, index: true },
    user: { type: Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, required: true },
    providerOrderId: { type: String, required: true, unique: true },
    captureId: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, required: true, default: 'CREATED' },
    failureReason: { type: String },
  },
  { timestamps: true },
);

export type PaymentAttrs = InferSchemaType<typeof paymentSchema>;
export type PaymentDocument = HydratedDocument<PaymentAttrs>;
export const PaymentModel = model('Payment', paymentSchema);
