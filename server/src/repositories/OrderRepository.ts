import { isValidObjectId } from 'mongoose';
import type { Order, Shipment } from '../domain/entities';
import type { OrderStatus } from '../domain/orderStatus';
import { OrderModel, type OrderDocument } from '../models/Order';

export type CreateOrderInput = Pick<
  Order,
  'userId' | 'customerName' | 'items' | 'requiresShipping' | 'shippingAddress' | 'notes' | 'total' | 'currency'
>;

export interface OrderRepository {
  create(input: CreateOrderInput): Promise<Order>;
  findById(id: string): Promise<Order | null>;
  findByUser(userId: string): Promise<Order[]>;
  /** Pedidos con envío físico activos, más los entregados desde `deliveredSince`. */
  findShippingBoard(deliveredSince: Date): Promise<Order[]>;
  /**
   * Cambio de estado atómico y condicional: solo aplica si el pedido sigue en `from`.
   * Evita condiciones de carrera entre dos administradores o dos capturas simultáneas.
   */
  transitionStatus(id: string, from: OrderStatus, to: OrderStatus, options?: { byUserId?: string; shipment?: Shipment }): Promise<Order | null>;
  markPaid(id: string, nextStatus: OrderStatus): Promise<Order | null>;
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
      { new: true },
    );
    return doc ? toOrder(doc) : null;
  }

  async markPaid(id: string, nextStatus: OrderStatus) {
    if (!isValidObjectId(id)) return null;
    const now = new Date();
    const set: Record<string, unknown> = { status: nextStatus, paymentStatus: 'PAID', paidAt: now };
    if (nextStatus === 'DELIVERED') set['shipment.deliveredAt'] = now;
    const doc = await OrderModel.findOneAndUpdate(
      { _id: id, status: 'PENDING_PAYMENT', paymentStatus: 'UNPAID' },
      { $set: set, $push: { history: { status: nextStatus, at: now } } },
      { new: true },
    );
    return doc ? toOrder(doc) : null;
  }
}
