export type Locale = 'es' | 'en';
export type LocalizedText = Record<Locale, string>;

export type Role = 'cliente' | 'administrador';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export const BOOK_CATEGORIES = ['ficcion', 'no_ficcion', 'ciencia', 'tecnologia', 'infantil'] as const;
export type BookCategory = (typeof BOOK_CATEGORIES)[number];

export const BOOK_FORMATS = ['ebook', 'impreso'] as const;
export type BookFormat = (typeof BOOK_FORMATS)[number];

export const LOW_STOCK_THRESHOLD = 3;

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
  /** Solo llega en vistas de administrador. */
  downloadUrl?: string;
  active: boolean;
}

export type BookInput = Omit<Book, 'id'>;

export const SHIPPING_STATUSES = ['PENDING', 'PREPARING', 'SHIPPED', 'DELIVERED'] as const;
export type ShippingStatus = (typeof SHIPPING_STATUSES)[number];
export type OrderStatus = 'PENDING_PAYMENT' | ShippingStatus | 'CANCELLED';

export interface OrderItem {
  bookId: string;
  title: LocalizedText;
  author: string;
  format: BookFormat;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  /** Solo presente cuando el pedido está pagado. */
  downloadUrl?: string;
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
  shippedAt?: string;
  deliveredAt?: string;
}

export interface Order {
  id: string;
  customerName?: string;
  items: OrderItem[];
  requiresShipping: boolean;
  shippingAddress?: ShippingAddress;
  shipment: Shipment;
  notes: string;
  total: number;
  currency: string;
  status: OrderStatus;
  paymentStatus: 'UNPAID' | 'PAID';
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentConfig {
  provider: 'paypal' | 'mock';
  clientId: string;
  currency: string;
}

export interface CartLine {
  bookId: string;
  quantity: number;
  /** Datos solo para mostrar; el servidor recalcula precio y stock. */
  title: LocalizedText;
  author: string;
  format: BookFormat;
  price: number;
  stock: number;
  coverUrl: string;
}
