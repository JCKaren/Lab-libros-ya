import { isValidObjectId } from 'mongoose';
import type { Order, OrderItem, Shipment } from '../domain/entities';
import type { OrderStatus } from '../domain/orderStatus';
import { OrderModel, type OrderDocument } from '../models/Order';

export type CreateOrderInput = Pick<Order, 'userId' | 'customerName' | 'requiresShipping' | 'shippingAddress' | 'notes' | 'total' | 'currency'> & {
  items: Omit<OrderItem, 'downloads'>[];
};

export interface OrderRepository {
  create(input: CreateOrderInput): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  findByUser(userId: string): Promise<Order[]>;
  countUnpaidByUser(userId: string): Promise<number>;
  /** Pedidos con envío físico activos, más los entregados desde `deliveredSince`. */
  findShippingBoard(deliveredSince: Date): Promise<Order[]>;
  /**
   * Cambio de estado atómico y condicional: solo aplica si el pedido sigue en `from`.
   * Evita condiciones de carrera entre dos administradores.
   */
  transitionStatus(id: string, from: OrderStatus, to: OrderStatus, options?: { byUserId?: string; shipment?: Shipment }): Promise<Order | null>;
  /** Cancela solo si nadie está cobrando el pedido (UNPAID). */
  cancelUnpaid(id: string, byUserId?: string): Promise<Order | null>;
  /** Vence pedidos sin pagar creados antes de `before`. Devuelve cuántos. */
  expireUnpaid(before: Date): Promise<number>;

  /** Toma el candado de cobro (UNPAID → PROCESSING). Solo un intento a la vez por pedido. */
  claimForPayment(id: string, paymentId: string): Promise<Order | null>;
  /** Libera el candado (PROCESSING → UNPAID) cuando el cobro falló de forma definitiva. */
  releasePaymentClaim(id: string): Promise<Order | null>;
  /** Renueva la marca de tiempo del candado (pago en revisión que sigue pendiente). */
  touchPaymentClaim(id: string): Promise<void>;
  setStockReserved(id: string, reserved: boolean): Promise<void>;
  /** PROCESSING → PAID. Solo el dueño del candado llega aquí. */
  markPaid(id: string, nextStatus: OrderStatus): Promise<Order | null>;
  /** Cobros en curso cuyo candado es anterior a `before` (capturas interrumpidas o pendientes). */
  findStaleProcessing(before: Date): Promise<Order[]>;

  /** Cuenta una descarga del e-book si el pedido está pagado y no se superó el límite. */
  registerDownload(id: string, bookId: string, limit: number): Promise<OrderItem | null>;
}

const toOrder = (doc: OrderDocument): Order => ({
  id: doc.id,
  userId: doc.user.toString(),
  customerName: doc.customerName,
  items: doc.items.map((i) => ({
    bookId: i.book.toString(),
    title: { es: i.title?.es ?? '', en: i.title?.en ?? '' },
    author: i.author,
    format: i.format,
    unitPrice: i.unitPrice,
    quantity: i.quantity,
    subtotal: i.subtotal,
    downloadUrl: i.downloadUrl ?? undefined,
    downloads: i.downloads ?? 0,
  })),
  requiresShipping: doc.requiresShipping,
  shippingAddress: doc.shippingAddress
    ? { recipient: doc.shippingAddress.recipient, line1: doc.shippingAddress.line1, city: doc.shippingAddress.city, phone: doc.shippingAddress.phone }
    : undefined,
  shipment: {
    carrier: doc.shipment?.carrier ?? undefined,
    trackingNumber: doc.shipment?.trackingNumber ?? undefined,
    shippedAt: doc.shipment?.shippedAt ?? undefined,
    deliveredAt: doc.shipment?.deliveredAt ?? undefined,
  },
  notes: doc.notes ?? '',
  total: doc.total,
  currency: doc.currency,
  status: doc.status,
  paymentStatus: doc.paymentStatus,
  activePaymentId: doc.activePayment?.toString(),
  paymentLockedAt: doc.paymentLockedAt ?? undefined,
  stockReserved: doc.stockReserved ?? false,
  paidAt: doc.paidAt ?? undefined,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export class MongoOrderRepository implements OrderRepository {
  async create(input: CreateOrderInput) {
    const doc = await OrderModel.create({
      user: input.userId,
      customerName: input.customerName,
      items: input.items.map((i) => ({ ...i, book: i.bookId })),
      requiresShipping: input.requiresShipping,
      shippingAddress: input.shippingAddress,
      notes: input.notes,
      total: input.total,
      currency: input.currency,
      status: 'PENDING_PAYMENT',
      paymentStatus: 'UNPAID',
      history: [{ status: 'PENDING_PAYMENT', by: input.userId }],
    });
    return toOrder(doc);
  }

  async findById(id: string) {
    if (!isValidObjectId(id)) return null;
    const doc = await OrderModel.findById(id);
    return doc ? toOrder(doc) : null;
  }

  async findByUser(userId: string) {
    const docs = await OrderModel.find({ user: userId }).sort({ createdAt: -1 }).limit(100);
    return docs.map(toOrder);
  }

  async findShippingBoard(deliveredSince: Date) {
    const docs = await OrderModel.find({
      requiresShipping: true,
      $or: [{ status: { $in: ['PENDING', 'PREPARING', 'SHIPPED'] } }, { status: 'DELIVERED', updatedAt: { $gte: deliveredSince } }],
    })
      .sort({ paidAt: 1, createdAt: 1 })
      .limit(300);
    return docs.map(toOrder);
  }

  async transitionStatus(id: string, from: OrderStatus, to: OrderStatus, options: { byUserId?: string; shipment?: Shipment } = {}) {
    if (!isValidObjectId(id)) return null;
    const set: Record<string, unknown> = { status: to };
    for (const [key, value] of Object.entries(options.shipment ?? {})) {
      if (value !== undefined) set[`shipment.${key}`] = value;
    }
    const doc = await OrderModel.findOneAndUpdate(
      { _id: id, status: from },
      { $set: set, $push: { history: { status: to, at: new Date(), by: options.byUserId } } },
      { returnDocument: 'after' },
    );
    return doc ? toOrder(doc) : null;
  }

  async countUnpaidByUser(userId: string) {
    return OrderModel.countDocuments({ user: userId, status: 'PENDING_PAYMENT' });
  }

  async cancelUnpaid(id: string, byUserId?: string) {
    if (!isValidObjectId(id)) return null;
    const doc = await OrderModel.findOneAndUpdate(
      { _id: id, status: 'PENDING_PAYMENT', paymentStatus: 'UNPAID' },
      { $set: { status: 'CANCELLED' }, $push: { history: { status: 'CANCELLED', at: new Date(), by: byUserId } } },
      { returnDocument: 'after' },
    );
    return doc ? toOrder(doc) : null;
  }

  async expireUnpaid(before: Date) {
    const result = await OrderModel.updateMany(
      { status: 'PENDING_PAYMENT', paymentStatus: 'UNPAID', createdAt: { $lt: before } },
      { $set: { status: 'CANCELLED' }, $push: { history: { status: 'CANCELLED', at: new Date() } } },
    );
    return result.modifiedCount;
  }

  async claimForPayment(id: string, paymentId: string) {
    if (!isValidObjectId(id)) return null;
    const doc = await OrderModel.findOneAndUpdate(
      { _id: id, status: 'PENDING_PAYMENT', paymentStatus: 'UNPAID' },
      { $set: { paymentStatus: 'PROCESSING', activePayment: paymentId, paymentLockedAt: new Date() } },
      { returnDocument: 'after' },
    );
    return doc ? toOrder(doc) : null;
  }

  async releasePaymentClaim(id: string) {
    if (!isValidObjectId(id)) return null;
    const doc = await OrderModel.findOneAndUpdate(
      { _id: id, paymentStatus: 'PROCESSING' },
      { $set: { paymentStatus: 'UNPAID' }, $unset: { activePayment: 1, paymentLockedAt: 1 } },
      { returnDocument: 'after' },
    );
    return doc ? toOrder(doc) : null;
  }

  async touchPaymentClaim(id: string) {
    await OrderModel.updateOne({ _id: id, paymentStatus: 'PROCESSING' }, { $set: { paymentLockedAt: new Date() } });
  }

  async setStockReserved(id: string, reserved: boolean) {
    await OrderModel.updateOne({ _id: id }, { $set: { stockReserved: reserved } });
  }

  async markPaid(id: string, nextStatus: OrderStatus) {
    if (!isValidObjectId(id)) return null;
    const now = new Date();
    const set: Record<string, unknown> = { status: nextStatus, paymentStatus: 'PAID', paidAt: now };
    if (nextStatus === 'DELIVERED') set['shipment.deliveredAt'] = now;
    const doc = await OrderModel.findOneAndUpdate(
      { _id: id, status: 'PENDING_PAYMENT', paymentStatus: 'PROCESSING' },
      { $set: set, $unset: { paymentLockedAt: 1 }, $push: { history: { status: nextStatus, at: now } } },
      { returnDocument: 'after' },
    );
    return doc ? toOrder(doc) : null;
  }

  async findStaleProcessing(before: Date) {
    const docs = await OrderModel.find({ paymentStatus: 'PROCESSING', paymentLockedAt: { $lt: before } }).limit(50);
    return docs.map(toOrder);
  }

  async registerDownload(id: string, bookId: string, limit: number) {
    if (!isValidObjectId(id) || !isValidObjectId(bookId)) return null;
    const doc = await OrderModel.findOneAndUpdate(
      {
        _id: id,
        paymentStatus: 'PAID',
        items: {
          $elemMatch: {
            book: bookId,
            format: 'ebook',
            downloadUrl: { $nin: [null, ''] },
            $or: [{ downloads: { $exists: false } }, { downloads: { $lt: limit } }],
          },
        },
      },
      { $inc: { 'items.$.downloads': 1 } },
      { returnDocument: 'after' },
    );
    return doc ? (toOrder(doc).items.find((i) => i.bookId === bookId) ?? null) : null;
  }
}
