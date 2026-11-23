import { randomUUID } from 'node:crypto';
import type { CaptureResult, CreateProviderOrderInput, PaymentGateway } from './PaymentGateway';

/**
 * Pasarela simulada SOLO para desarrollo local sin credenciales de PayPal.
 * La configuración impide usarla en producción (ver config/env.ts).
 */
export class MockGateway implements PaymentGateway {
  readonly name = 'mock';
  private readonly orders = new Map<string, CreateProviderOrderInput & { captureId?: string }>();

  async createOrder(input: CreateProviderOrderInput) {
    const providerOrderId = `MOCK-${randomUUID()}`;
    this.orders.set(providerOrderId, { ...input });
    return { providerOrderId };
  }

  async captureOrder(providerOrderId: string): Promise<CaptureResult> {
    const order = this.orders.get(providerOrderId);
    if (!order) return { completed: false, rawStatus: 'NOT_FOUND' };
    order.captureId ??= `MOCKCAP-${randomUUID()}`;
    return {
      completed: true,
      captureId: order.captureId,
      amount: order.amount,
      currency: order.currency,
      referenceId: order.referenceId,
      rawStatus: 'COMPLETED',
    };
  }
}
