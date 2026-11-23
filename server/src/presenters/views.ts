import type { Book, Order } from '../domain/entities';

/**
 * Presentadores: deciden qué datos ve cada audiencia.
 * Se usan tanto en REST como en WebSockets para que nunca diverjan.
 */

/** Cliente: no recibe su id interno; los enlaces de descarga solo aparecen si el pedido está pagado. */
export function customerOrderView(order: Order) {
  const { userId: _userId, customerName: _name, ...rest } = order;
  const paid = order.paymentStatus === 'PAID';
  return { ...rest, items: rest.items.map(({ downloadUrl, ...item }) => (paid && downloadUrl ? { ...item, downloadUrl } : item)) };
}

/** Administración: necesita nombre y dirección para enviar; no ve ids de usuario ni enlaces de descarga. */
export function adminOrderView(order: Order) {
  const { userId: _userId, ...rest } = order;
  return { ...rest, items: rest.items.map(({ downloadUrl: _d, ...item }) => item) };
}

/** Catálogo público: sin el enlace de descarga del e-book. */
export function publicBookView(book: Book) {
  const { downloadUrl: _downloadUrl, ...rest } = book;
  return rest;
}
