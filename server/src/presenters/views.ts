import type { Book, Order } from '../domain/entities';
import { DOWNLOAD_LIMIT } from '../services/DownloadService';

/**
 * Presentadores: deciden qué datos ve cada audiencia.
 * Se usan tanto en REST como en WebSockets para que nunca diverjan.
 * Campos internos (ids de usuario, candados de cobro, enlaces de descarga) nunca salen.
 */
function baseOrderView(order: Order) {
  const { userId: _u, activePaymentId: _p, paymentLockedAt: _l, stockReserved: _s, ...rest } = order;
  return rest;
}

/** Cliente: en vez del enlace del e-book recibe si puede descargarlo y cuántas descargas le quedan. */
export function customerOrderView(order: Order) {
  const { customerName: _name, ...rest } = baseOrderView(order);
  const paid = order.paymentStatus === 'PAID';
  return {
    ...rest,
    items: rest.items.map(({ downloadUrl, downloads, ...item }) =>
      item.format === 'ebook' && paid && downloadUrl
        ? { ...item, downloadable: true, downloadsLeft: Math.max(0, DOWNLOAD_LIMIT - downloads) }
        : item,
    ),
  };
}

/** Administración: necesita nombre y dirección para enviar; no ve ids de usuario ni enlaces de descarga. */
export function adminOrderView(order: Order) {
  const rest = baseOrderView(order);
  return { ...rest, items: rest.items.map(({ downloadUrl: _d, downloads: _n, ...item }) => item) };
}

/** Catálogo público: sin el enlace de descarga del e-book. */
export function publicBookView(book: Book) {
  const { downloadUrl: _downloadUrl, ...rest } = book;
  return rest;
}
