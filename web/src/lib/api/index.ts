import type { Book, BookCategory, BookFormat, BookInput, Order, PaymentConfig, ShippingAddress, ShippingStatus, User } from '../types';
import { http } from './http';

export { ApiError, configureHttp } from './http';

interface AuthResponse {
  token: string;
  user: User;
}

export interface BookQuery {
  category?: BookCategory;
  format?: BookFormat;
  q?: string;
  all?: boolean;
}

export interface CreateOrderBody {
  items: { bookId: string; quantity: number }[];
  shippingAddress?: ShippingAddress;
  notes?: string;
}

/**
 * Patrón Facade: las páginas usan estas funciones y nunca construyen URLs,
 * cabeceras ni manejan errores HTTP directamente.
 */
export const authApi = {
  login: (body: { email: string; password: string }) => http<AuthResponse>('/auth/login', { method: 'POST', body }),
  register: (body: { name: string; email: string; password: string }) =>
    http<AuthResponse>('/auth/register', { method: 'POST', body }),
  me: () => http<{ user: User }>('/auth/me').then((r) => r.user),
};

export const booksApi = {
  list: (query: BookQuery = {}) =>
    http<{ books: Book[] }>('/books', {
      query: { category: query.category, format: query.format, q: query.q || undefined, all: query.all ? 'true' : undefined },
    }).then((r) => r.books),
  get: (id: string) => http<{ book: Book }>(`/books/${id}`).then((r) => r.book),
  create: (body: BookInput) => http<{ book: Book }>('/books', { method: 'POST', body }).then((r) => r.book),
  update: (id: string, body: Partial<BookInput>) => http<{ book: Book }>(`/books/${id}`, { method: 'PATCH', body }).then((r) => r.book),
  adjustStock: (id: string, delta: number) =>
    http<{ book: Book }>(`/books/${id}/stock`, { method: 'POST', body: { delta } }).then((r) => r.book),
  remove: (id: string) => http<void>(`/books/${id}`, { method: 'DELETE' }),
};

export const ordersApi = {
  create: (body: CreateOrderBody) => http<{ order: Order }>('/orders', { method: 'POST', body }).then((r) => r.order),
  mine: () => http<{ orders: Order[] }>('/orders/me').then((r) => r.orders),
  get: (id: string) => http<{ order: Order }>(`/orders/${id}`).then((r) => r.order),
  shipping: () => http<{ orders: Order[] }>('/orders/shipping').then((r) => r.orders),
  changeStatus: (id: string, status: ShippingStatus, shipment: { carrier?: string; trackingNumber?: string } = {}) =>
    http<{ order: Order }>(`/orders/${id}/status`, { method: 'PATCH', body: { status, ...shipment } }).then((r) => r.order),
  cancel: (id: string) => http<{ order: Order }>(`/orders/${id}/cancel`, { method: 'POST' }).then((r) => r.order),
};

export const paymentsApi = {
  config: () => http<PaymentConfig>('/payments/config'),
  createOrder: (orderId: string) =>
    http<{ providerOrderId: string }>('/payments/paypal/order', { method: 'POST', body: { orderId } }),
  capture: (orderId: string, providerOrderId: string) =>
    http<{ order: Order }>('/payments/paypal/capture', { method: 'POST', body: { orderId, providerOrderId } }).then((r) => r.order),
};
