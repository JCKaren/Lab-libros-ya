import type { BookCategory, BookFormat } from './catalog';
import type { LocalizedText } from './localized';
import type { OrderPaymentStatus, OrderStatus, PaymentStatus } from './orderStatus';
import type { Role } from './roles';

/**
 * Entidades de dominio como objetos planos. Los servicios trabajan con estas
 * interfaces y no conocen Mongoose (principio de inversión de dependencias).
 */
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
}

export interface Book {
  id: string;
  title: LocalizedText;
  author: string;
  description: LocalizedText;
  category: BookCategory;
  format: BookFormat;
  isbn: string;
  price: number;
  stock: number;
  coverUrl: string;
  /** Solo e-books. Se entrega al cliente únicamente cuando el pedido está pagado. */
  downloadUrl: string;
  active: boolean;
}

export interface OrderItem {
  bookId: string;
  title: LocalizedText;
  author: string;
  format: BookFormat;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  /** Interno: nunca se envía al navegador; las descargas pasan por enlaces firmados. */
  downloadUrl?: string;
  downloads: number;
}

export interface ShippingAddress {
  recipient: string;
  line1: string;
  city: string;
  phone: string;
}

export interface Shipment {
  carrier?: string;
  trackingNumber?: string;
  shippedAt?: Date;
  deliveredAt?: Date;
}

export interface Order {
  id: string;
  userId: string;
  customerName: string;
  items: OrderItem[];
  requiresShipping: boolean;
  shippingAddress?: ShippingAddress;
  shipment: Shipment;
  notes: string;
  total: number;
  currency: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  /** Candado de cobro: pago en curso y desde cuándo (para conciliar capturas interrumpidas). */
  activePaymentId?: string;
  paymentLockedAt?: Date;
  /** El stock del pedido ya está descontado (evita descontarlo dos veces al reintentar). */
  stockReserved: boolean;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  orderId: string;
  userId: string;
  provider: string;
  providerOrderId: string;
  captureId?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  updatedAt: Date;
}

/** Usuario autenticado. El rol y el nombre se leen de la base de datos en cada petición. */
export interface AuthUser {
  id: string;
  role: Role;
  name: string;
}
