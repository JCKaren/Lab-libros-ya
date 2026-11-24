import type { AuthUser, Order, Payment } from '../../domain/entities';
import { statusAfterPayment } from '../../domain/orderStatus';
import type { OrderRepository } from '../../repositories/OrderRepository';
import type { PaymentRepository } from '../../repositories/PaymentRepository';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { toCents } from '../../utils/money';
import type { InventoryService } from '../InventoryService';
import type { OrderNotifier } from '../OrderNotifier';
import { PaymentGatewayError, type CaptureResult, type PaymentGateway } from './PaymentGateway';

export interface PublicPaymentConfig {
  provider: string;
  clientId: string;
  currency: string;
}

/** Intentos de pago (órdenes en el proveedor) permitidos por pedido. */
export const MAX_PAYMENT_ATTEMPTS = 5;
/** Un candado de cobro más viejo que esto se considera interrumpido y lo concilia el sistema. */
export const STALE_LOCK_MS = 2 * 60 * 1000;

/**
 * Orquesta el cobro: depende de abstracciones (PaymentGateway, repositorios,
 * inventario, notificador) inyectadas desde el composition root.
 *
 * Invariantes:
 * - Solo un intento de cobro por pedido a la vez (candado UNPAID → PROCESSING en el pedido).
 *   Mientras el candado existe, el pedido no se puede cancelar ni cobrar por otra vía.
 * - El stock se descuenta antes de cobrar y una sola vez (bandera `stockReserved`).
 * - Si hubo cobro pero no se puede confirmar el pedido, se reembolsa.
 * - Si el resultado es incierto (red/5xx/revisión), el candado se mantiene y
 *   `reconcile()` lo resuelve consultando al proveedor.
 */
export class PaymentService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly payments: PaymentRepository,
    private readonly orders: OrderRepository,
    private readonly inventory: InventoryService,
    private readonly notifier: OrderNotifier,
    private readonly publicClientId: string,
  ) {}

  /** Datos NO secretos que necesita el frontend para mostrar los botones de pago. */
  getPublicConfig(currency: string): PublicPaymentConfig {
    return { provider: this.gateway.name, clientId: this.publicClientId, currency };
  }

  /** Crea (o reutiliza) la orden en el proveedor con el importe calculado en el servidor. */
  async createProviderOrder(user: AuthUser, orderId: string): Promise<{ providerOrderId: string }> {
    const order = await this.getOwnedOrder(user, orderId);
    this.assertPayable(order);

    const reusable = await this.payments.findReusableForOrder(order.id, order.total, this.gateway.name);
    if (reusable) return { providerOrderId: reusable.providerOrderId };

    if ((await this.payments.countForOrder(order.id)) >= MAX_PAYMENT_ATTEMPTS) {
      throw AppError.conflict('TOO_MANY_PAYMENT_ATTEMPTS', 'Se alcanzó el máximo de intentos de pago para este pedido');
    }

    try {
      const { providerOrderId } = await this.gateway.createOrder({
        referenceId: order.id,
        amount: order.total,
        currency: order.currency,
        description: `Libros Ya #${order.id.slice(-6).toUpperCase()}`,
      });
      await this.payments.create({
        orderId: order.id,
        userId: user.id,
        provider: this.gateway.name,
        providerOrderId,
        amount: order.total,
        currency: order.currency,
      });
      return { providerOrderId };
    } catch (err) {
      throw this.toAppError(err);
    }
  }

  /** Captura iniciada por el cliente tras aprobar el pago en PayPal. Idempotente. */
  async capture(user: AuthUser, orderId: string, providerOrderId: string): Promise<Order> {
    const order = await this.getOwnedOrder(user, orderId);
    const payment = await this.payments.findByProviderOrderId(providerOrderId);
    if (!payment || payment.orderId !== order.id || payment.userId !== user.id) throw AppError.notFound('Pago');

    if (payment.status === 'CAPTURED' && order.paymentStatus === 'PAID') return order; // repetición
    if (order.paymentStatus === 'PROCESSING') {
      throw AppError.conflict('PAYMENT_IN_PROGRESS', 'Estamos confirmando tu pago; revisa "Mis pedidos" en unos minutos');
    }
    this.assertPayable(order);

    // 1. Candado a nivel de pedido: excluye cancelaciones y capturas concurrentes de otro pago.
    const claimed = await this.orders.claimForPayment(order.id, payment.id);
    if (!claimed) {
      const fresh = await this.orders.findById(order.id);
      if (fresh?.paymentStatus === 'PAID') return fresh;
      if (fresh?.paymentStatus === 'PROCESSING') throw AppError.conflict('PAYMENT_IN_PROGRESS', 'El pago ya se está procesando');
      throw AppError.conflict('ORDER_NOT_PAYABLE', 'Este pedido ya no admite pagos');
    }
    const locked = await this.payments.transition(payment.id, ['CREATED', 'APPROVED', 'FAILED'], 'CAPTURING');
    if (!locked) {
      await this.orders.releasePaymentClaim(order.id);
      throw AppError.conflict('PAYMENT_NOT_CAPTURABLE', 'Este intento de pago ya no se puede capturar');
    }

    // 2. Reserva de stock ANTES de cobrar: si no alcanza, no se cobra.
    try {
      await this.reserveStock(claimed);
    } catch (err) {
      await this.payments.transition(payment.id, ['CAPTURING'], 'FAILED', { failureReason: 'sin stock' });
      await this.orders.releasePaymentClaim(order.id);
      throw err;
    }

    // 3. Captura en el proveedor.
    let result: CaptureResult;
    try {
      result = await this.gateway.captureOrder(providerOrderId);
    } catch (err) {
      if (err instanceof PaymentGatewayError && err.retryable) {
        // Resultado incierto: pudo cobrarse. Se mantiene el candado y el stock; reconcile() decide.
        logger.warn(`Captura incierta para pedido ${order.id}; queda para conciliación`);
        throw AppError.badGateway('PAYMENT_PENDING_CONFIRMATION', 'No pudimos confirmar el pago aún; lo verificaremos en unos minutos');
      }
      await this.failDefinitively(locked, claimed, (err as Error).message);
      throw this.toAppError(err);
    }

    // 4. Verificación y cierre (compartido con la conciliación).
    return this.settle(claimed, locked, result);
  }

  /**
   * Conciliación periódica (la llama un temporizador del servidor):
   * resuelve cobros interrumpidos, en revisión o con reembolso pendiente.
   */
  async reconcile(now = new Date()): Promise<number> {
    let settled = 0;
    for (const order of await this.orders.findStaleProcessing(new Date(now.getTime() - STALE_LOCK_MS))) {
      try {
        if (await this.reconcileOrder(order)) settled += 1;
      } catch (err) {
        logger.error(`Conciliación del pedido ${order.id} falló`, (err as Error).message);
      }
    }
    return settled;
  }

  private async reconcileOrder(order: Order): Promise<boolean> {
    const payment = order.activePaymentId ? await this.payments.findById(order.activePaymentId) : null;
    if (!payment) {
      // Candado sin pago asociado: se libera devolviendo el stock si se había descontado.
      await this.releaseStock(order);
      await this.orders.releasePaymentClaim(order.id);
      return true;
    }

    let result: CaptureResult;
    if (payment.status === 'CAPTURED') {
      // El cobro se confirmó pero el pedido no alcanzó a marcarse pagado (fallo de BD o reinicio).
      result = await this.gateway.getCaptureStatus(payment.providerOrderId);
    } else if (payment.status === 'CAPTURING') {
      result = await this.gateway.captureOrder(payment.providerOrderId); // idempotente
    } else if (payment.status === 'PENDING') {
      result = await this.gateway.getCaptureStatus(payment.providerOrderId);
    } else {
      await this.releaseStock(order);
      await this.orders.releasePaymentClaim(order.id);
      return true;
    }
    try {
      await this.settle(order, payment, result);
    } catch (err) {
      if (!(err instanceof AppError)) throw err; // fallo/reembolso ya aplicado: resuelto
    }
    return true;
  }

  /** Aplica el resultado de una captura: confirma, deja en revisión, reembolsa o falla. */
  private async settle(order: Order, payment: Payment, result: CaptureResult): Promise<Order> {
    if (result.state === 'PENDING') {
      await this.payments.transition(payment.id, ['CAPTURING', 'PENDING'], 'PENDING', { failureReason: `revisión: ${result.rawStatus}` });
      await this.orders.touchPaymentClaim(order.id);
      return (await this.orders.findById(order.id)) ?? order;
    }

    if (result.state === 'FAILED') {
      await this.failDefinitively(payment, order, `estado ${result.rawStatus}`);
      throw AppError.badRequest('PAYMENT_NOT_VERIFIED', 'No pudimos verificar el pago. No se confirmó el pedido.');
    }

    const mismatch = this.findMismatch(order, result);
    if (mismatch) {
      // Hubo cobro pero no corresponde a este pedido: se reembolsa y no se confirma.
      logger.error(`Captura inconsistente para pedido ${order.id}: ${mismatch}; se reembolsa`);
      await this.refundAndFail(payment, order, result, mismatch);
      throw AppError.badRequest('PAYMENT_NOT_VERIFIED', 'No pudimos verificar el pago. Se reembolsó el cobro.');
    }

    await this.payments.transition(payment.id, ['CAPTURING', 'PENDING', 'CAPTURED'], 'CAPTURED', { captureId: result.captureId });
    const paid = await this.orders.markPaid(order.id, statusAfterPayment(order.requiresShipping));
    if (!paid) {
      // Con el candado esto no debería ocurrir; si el pedido ya está pagado, es una repetición.
      const fresh = await this.orders.findById(order.id);
      if (fresh?.paymentStatus === 'PAID') return fresh;
      logger.error(`Pedido ${order.id} cobrado pero no confirmable; se reembolsa`);
      await this.refundAndFail(payment, order, result, 'pedido no confirmable');
      throw AppError.conflict('ORDER_NOT_PAYABLE', 'Este pedido ya no admite pagos. Se reembolsó el cobro.');
    }

    this.notifier.orderPaid(paid);
    return paid;
  }

  private async reserveStock(order: Order): Promise<void> {
    if (order.stockReserved) return; // ya descontado en un intento anterior
    await this.inventory.reserve(order.items);
    await this.orders.setStockReserved(order.id, true);
  }

  private async releaseStock(order: Order): Promise<void> {
    const current = (await this.orders.findById(order.id)) ?? order;
    if (!current.stockReserved) return;
    await this.inventory.release(current.items);
    await this.orders.setStockReserved(order.id, false);
  }

  /** Fallo sin cobro: marca el pago, devuelve el stock y libera el pedido para reintentar. */
  private async failDefinitively(payment: Payment, order: Order, reason: string): Promise<void> {
    await this.payments.transition(payment.id, ['CAPTURING', 'PENDING'], 'FAILED', { failureReason: reason });
    await this.releaseStock(order);
    await this.orders.releasePaymentClaim(order.id);
  }

  /** Fallo con cobro: reembolsa; si el reembolso falla, deja el candado para reintentar en la conciliación. */
  private async refundAndFail(payment: Payment, order: Order, result: CaptureResult, reason: string): Promise<void> {
    if (!result.captureId || result.amount === undefined || !result.currency) {
      await this.failDefinitively(payment, order, reason);
      return;
    }
    try {
      await this.gateway.refund(result.captureId, result.amount, result.currency);
    } catch (err) {
      logger.error(`Reembolso pendiente para pedido ${order.id}`, (err as Error).message);
      return; // el candado queda; reconcile() lo reintentará
    }
    await this.payments.transition(payment.id, ['CAPTURING', 'PENDING', 'CAPTURED'], 'REFUNDED', { captureId: result.captureId, failureReason: reason });
    await this.releaseStock(order);
    await this.orders.releasePaymentClaim(order.id);
  }

  private assertPayable(order: Order): void {
    if (order.status !== 'PENDING_PAYMENT' || order.paymentStatus !== 'UNPAID') {
      throw AppError.conflict('ORDER_NOT_PAYABLE', 'Este pedido ya no admite pagos');
    }
  }

  private findMismatch(order: Order, result: CaptureResult): string | null {
    if (result.amount === undefined || toCents(result.amount) !== toCents(order.total)) return 'importe distinto';
    if (result.currency !== order.currency) return 'moneda distinta';
    if (result.referenceId !== order.id) return 'referencia distinta';
    return null;
  }

  private async getOwnedOrder(user: AuthUser, orderId: string): Promise<Order> {
    const order = await this.orders.findById(orderId);
    if (!order || order.userId !== user.id) throw AppError.notFound('Pedido');
    return order;
  }

  private toAppError(err: unknown): Error {
    if (err instanceof AppError) return err;
    if (err instanceof PaymentGatewayError) {
      return AppError.badGateway('PAYMENT_PROVIDER_ERROR', 'El proveedor de pagos no respondió correctamente. Intenta de nuevo.');
    }
    return err as Error;
  }
}
