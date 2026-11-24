import { requiresShipping } from '../domain/catalog';
import type { AuthUser, Order, ShippingAddress } from '../domain/entities';
import { canTransition, type OrderStatus } from '../domain/orderStatus';
import { PricingError, priceOrder, type RequestedItem } from '../domain/pricing';
import type { BookRepository } from '../repositories/BookRepository';
import type { OrderRepository } from '../repositories/OrderRepository';
import { AppError } from '../utils/AppError';
import type { OrderNotifier } from './OrderNotifier';

const DELIVERED_VISIBLE_MS = 3 * 24 * 60 * 60 * 1000;
/** Pedidos sin pagar que puede tener abiertos un cliente a la vez. */
export const MAX_UNPAID_ORDERS = 5;
/** Un pedido sin pagar vence (se cancela) tras este tiempo. */
export const UNPAID_TTL_MS = 24 * 60 * 60 * 1000;

const PRICING_MESSAGES = {
  BOOK_NOT_FOUND: 'Un libro del carrito ya no existe',
  BOOK_UNAVAILABLE: 'Un libro del carrito ya no está disponible',
  OUT_OF_STOCK: 'No hay stock suficiente para uno de los libros',
  INVALID_QUANTITY: 'Cantidad inválida',
} as const;

export interface CreateOrderCommand {
  items: RequestedItem[];
  shippingAddress?: ShippingAddress;
  notes?: string;
}

export interface ShipmentInput {
  carrier?: string;
  trackingNumber?: string;
}

export class OrderService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly books: BookRepository,
    private readonly notifier: OrderNotifier,
    private readonly currency: string,
  ) {}

  /**
   * Crea un pedido pendiente de pago. El cliente solo envía ids y cantidades;
   * precio, total, stock y necesidad de envío los decide el servidor.
   */
  async create(user: AuthUser, input: CreateOrderCommand): Promise<Order> {
    if ((await this.orders.countUnpaidByUser(user.id)) >= MAX_UNPAID_ORDERS) {
      throw AppError.conflict('TOO_MANY_PENDING_ORDERS', 'Tienes demasiados pedidos sin pagar; paga o cancela alguno');
    }
    const catalog = await this.books.findManyByIds(input.items.map((i) => i.bookId));
    let priced;
    try {
      priced = priceOrder(input.items, catalog);
    } catch (err) {
      if (err instanceof PricingError) throw AppError.badRequest(err.code, PRICING_MESSAGES[err.code], { bookId: err.bookId });
      throw err;
    }

    const needsShipping = priced.lines.some((l) => requiresShipping(l.format));
    if (needsShipping && !input.shippingAddress) {
      throw AppError.badRequest('ADDRESS_REQUIRED', 'Los libros impresos requieren una dirección de envío');
    }

    return this.orders.create({
      userId: user.id,
      customerName: user.name,
      items: priced.lines,
      requiresShipping: needsShipping,
      // Un pedido solo digital no guarda dirección: no se recolectan datos innecesarios.
      shippingAddress: needsShipping ? input.shippingAddress : undefined,
      notes: input.notes ?? '',
      total: priced.total,
      currency: this.currency,
    });
  }

  listMine(user: AuthUser): Promise<Order[]> {
    return this.orders.findByUser(user.id);
  }

  /** El cliente solo ve sus pedidos; el administrador ve cualquiera. Responde 404 para no filtrar existencia. */
  async getVisible(user: AuthUser, orderId: string): Promise<Order> {
    const order = await this.orders.findById(orderId);
    if (!order || (user.role === 'cliente' && order.userId !== user.id)) throw AppError.notFound('Pedido');
    return order;
  }

  /** Tablero de envíos: los entregados se muestran 3 días para que no crezca sin límite. */
  listShipping(): Promise<Order[]> {
    return this.orders.findShippingBoard(new Date(Date.now() - DELIVERED_VISIBLE_MS));
  }

  async changeStatus(user: AuthUser, orderId: string, to: OrderStatus, shipment: ShipmentInput = {}): Promise<Order> {
    const current = await this.orders.findById(orderId);
    if (!current) throw AppError.notFound('Pedido');
    if (!current.requiresShipping) throw AppError.badRequest('NOT_SHIPPABLE', 'Este pedido es digital y no tiene envío');
    if (current.status === to) return current;
    if (!canTransition(current.status, to, user.role)) {
      throw AppError.badRequest('INVALID_TRANSITION', `No se puede pasar de ${current.status} a ${to}`);
    }

    const updated = await this.orders.transitionStatus(orderId, current.status, to, {
      byUserId: user.id,
      shipment: this.shipmentFor(to, shipment),
    });
    if (!updated) throw AppError.conflict('STALE_ORDER', 'El pedido cambió mientras tanto; recarga el tablero');
    this.notifier.orderStatusChanged(updated);
    return updated;
  }

  /**
   * El cliente puede cancelar un pedido que aún no ha pagado. Es atómico con el
   * candado de cobro: si hay una captura en curso, la cancelación se rechaza.
   */
  async cancelUnpaid(user: AuthUser, orderId: string): Promise<Order> {
    const order = await this.getVisible(user, orderId);
    if (order.userId !== user.id) throw AppError.notFound('Pedido');
    if (!canTransition(order.status, 'CANCELLED', user.role)) {
      throw AppError.badRequest('INVALID_TRANSITION', 'Solo se pueden cancelar pedidos pendientes de pago');
    }
    if (order.paymentStatus === 'PROCESSING') {
      throw AppError.conflict('PAYMENT_IN_PROGRESS', 'Hay un pago en curso para este pedido; no se puede cancelar');
    }
    const updated = await this.orders.cancelUnpaid(orderId, user.id);
    if (!updated) throw AppError.conflict('STALE_ORDER', 'El pedido cambió mientras tanto (puede haber un pago en curso)');
    this.notifier.orderStatusChanged(updated);
    return updated;
  }

  /** Vence pedidos sin pagar antiguos (los llama el temporizador del servidor). */
  expireUnpaid(now = new Date()): Promise<number> {
    return this.orders.expireUnpaid(new Date(now.getTime() - UNPAID_TTL_MS));
  }

  /** Datos de envío que se registran en cada transición. */
  private shipmentFor(to: OrderStatus, input: ShipmentInput) {
    if (to === 'SHIPPED') return { carrier: input.carrier, trackingNumber: input.trackingNumber, shippedAt: new Date() };
    if (to === 'DELIVERED') return { deliveredAt: new Date() };
    return undefined;
  }
}
