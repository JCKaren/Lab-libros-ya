import { isValidObjectId } from 'mongoose';
import type { Payment } from '../domain/entities';
import type { PaymentStatus } from '../domain/orderStatus';
import { PaymentModel, type PaymentDocument } from '../models/Payment';

export type CreatePaymentInput = Pick<Payment, 'orderId' | 'userId' | 'provider' | 'providerOrderId' | 'amount' | 'currency'>;

export interface PaymentRepository {
  create(input: CreatePaymentInput): Promise<Payment>;
  findByProviderOrderId(providerOrderId: string): Promise<Payment | null>;
  findReusableForOrder(orderId: string, amount: number, provider: string): Promise<Payment | null>;
  /** Cambio atómico: solo uno de varios intentos concurrentes obtiene el "candado" de captura. */
  transition(id: string, from: readonly PaymentStatus[], to: PaymentStatus, extra?: Partial<Pick<Payment, 'captureId'>> & { failureReason?: string }): Promise<Payment | null>;
}

const toPayment = (doc: PaymentDocument): Payment => ({
  id: doc.id,
  orderId: doc.order.toString(),
  userId: doc.user.toString(),
  provider: doc.provider,
  providerOrderId: doc.providerOrderId,
  captureId: doc.captureId ?? undefined,
  amount: doc.amount,
  currency: doc.currency,
  status: doc.status,
});

export class MongoPaymentRepository implements PaymentRepository {
  async create(input: CreatePaymentInput) {
    const doc = await PaymentModel.create({
      order: input.orderId,
      user: input.userId,
      provider: input.provider,
      providerOrderId: input.providerOrderId,
      amount: input.amount,
      currency: input.currency,
      status: 'CREATED',
    });
    return toPayment(doc);
  }

  async findByProviderOrderId(providerOrderId: string) {
    const doc = await PaymentModel.findOne({ providerOrderId });
    return doc ? toPayment(doc) : null;
  }

  async findReusableForOrder(orderId: string, amount: number, provider: string) {
    if (!isValidObjectId(orderId)) return null;
    const doc = await PaymentModel.findOne({ order: orderId, amount, provider, status: 'CREATED' }).sort({ createdAt: -1 });
    return doc ? toPayment(doc) : null;
  }

  async transition(id: string, from: readonly PaymentStatus[], to: PaymentStatus, extra: { captureId?: string; failureReason?: string } = {}) {
    const doc = await PaymentModel.findOneAndUpdate({ _id: id, status: { $in: from } }, { $set: { status: to, ...extra } }, { new: true });
    return doc ? toPayment(doc) : null;
  }
}
