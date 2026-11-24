import { randomUUID } from 'node:crypto';
import type { CaptureResult, CreateProviderOrderInput, PaymentGateway } from './PaymentGateway';

/**
 * Pasarela simulada SOLO para desarrollo local sin credenciales de PayPal.
 * La configuración impide usarla en producción (ver config/env.ts).
 */
export class MockGateway implements PaymentGateway {
  readonly name = 'mock';
  private readonly orders = new Map<string, CreateProviderOrderInput & { captureId?: string; refunded?: boolean }>();

  async createOrder(input: CreateProviderOrderInput) {
    const providerOrderId = `MOCK-${randomUUID()}`;
    this.orders.set(providerOrderId, { ...input });
    return { providerOrderId };
  }

  async captureOrder(providerOrderId: string): Promise<CaptureResult> {
    const order = this.orders.get(providerOrderId);
    if (!order) return { state: 'FAILED', rawStatus: 'NOT_FOUND' };
    order.captureId ??= `MOCKCAP-${randomUUID()}`;
    return this.result(order);
  }

  async getCaptureStatus(providerOrderId: string): Promise<CaptureResult> {
    const order = this.orders.get(providerOrderId);
    if (!order?.captureId) return { state: 'FAILED', rawStatus: order ? 'NOT_CAPTURED' : 'NOT_FOUND' };
    return this.result(order);
  }

  async refund(captureId: string): Promise<void> {
    for (const order of this.orders.values()) if (order.captureId === captureId) order.refunded = true;
  }

  private result(order: CreateProviderOrderInput & { captureId?: string }): CaptureResult {
    return {
      state: 'COMPLETED',
      captureId: order.captureId,
      amount: order.amount,
      currency: order.currency,
      referenceId: order.referenceId,
      rawStatus: 'COMPLETED',
    };
  }
}
