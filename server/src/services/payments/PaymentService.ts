import type { AuthUser, Order } from '../../domain/entities';
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

/**
 * Orquesta el cobro: depende de abstracciones (PaymentGateway, repositorios,
 * inventario, notificador) inyectadas desde el composition root.
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
    if (order.status !== 'PENDING_PAYMENT') throw AppError.conflict('ORDER_NOT_PAYABLE', 'Este pedido ya no admite pagos');

    const reusable = await this.payments.findReusableForOrder(order.id, order.total, this.gateway.name);
    if (reusable) return { providerOrderId: reusable.providerOrderId };

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

  /**
   * Captura idempotente:
   * 1. verifica propiedad y bloquea el pago (solo un intento a la vez);
   * 2. reserva el stock ANTES de cobrar (si no alcanza, no se cobra);
   * 3. captura y verifica importe, moneda y referencia;
   * 4. si algo falla, devuelve el stock; si todo va bien, confirma y notifica.
   */
  async capture(user: AuthUser, orderId: string, providerOrderId: string): Promise<Order> {
    const order = await this.getOwnedOrder(user, orderId);
    const payment = await this.payments.findByProviderOrderId(providerOrderId);
    if (!payment || payment.orderId !== order.id || payment.userId !== user.id) throw AppError.notFound('Pago');

    if (payment.status === 'CAPTURED') return order; // repetición: devuelve el resultado conocido
    if (order.status !== 'PENDING_PAYMENT') throw AppError.conflict('ORDER_NOT_PAYABLE', 'Este pedido ya no admite pagos');

    const locked = await this.payments.transition(payment.id, ['CREATED', 'APPROVED', 'FAILED'], 'CAPTURING');
    if (!locked) throw AppError.conflict('PAYMENT_IN_PROGRESS', 'El pago ya se está procesando');

    try {
      await this.inventory.reserve(order.items);
    } catch (err) {
      await this.payments.transition(payment.id, ['CAPTURING'], 'FAILED', { failureReason: 'sin stock' });
      throw err;
    }

    let result: CaptureResult;
    try {
      result = await this.gateway.captureOrder(providerOrderId);
    } catch (err) {
      await this.fail(payment.id, order, (err as Error).message);
      throw this.toAppError(err);
    }

    const mismatch = this.findMismatch(order, result);
    if (mismatch) {
      logger.error(`Captura inconsistente para pedido ${order.id}: ${mismatch}`);
      await this.fail(payment.id, order, mismatch);
      throw AppError.badRequest('PAYMENT_NOT_VERIFIED', 'No pudimos verificar el pago. No se confirmó el pedido.');
    }

    await this.payments.transition(payment.id, ['CAPTURING'], 'CAPTURED', { captureId: result.captureId });
    const paid = await this.orders.markPaid(order.id, statusAfterPayment(order.requiresShipping));
    if (!paid) return (await this.orders.findById(order.id)) ?? order;

    this.notifier.orderPaid(paid);
    return paid;
  }

  private async fail(paymentId: string, order: Order, reason: string): Promise<void> {
    await this.payments.transition(paymentId, ['CAPTURING'], 'FAILED', { failureReason: reason });
    await this.inventory.release(order.items);
  }

  private findMismatch(order: Order, result: CaptureResult): string | null {
    if (!result.completed) return `estado ${result.rawStatus}`;
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
