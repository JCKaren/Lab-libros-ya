import { SHIPPING_STATUSES, type Order, type ShippingStatus } from './types';

/**
 * Espejo en la interfaz de la regla del backend: el administrador avanza o
 * retrocede un paso a la vez. Solo da feedback inmediato; el servidor decide.
 */
export function canMove(from: ShippingStatus, to: ShippingStatus): boolean {
  if (from === 'DELIVERED') return false;
  return Math.abs(SHIPPING_STATUSES.indexOf(from) - SHIPPING_STATUSES.indexOf(to)) === 1;
}

export function isShippingStatus(status: string): status is ShippingStatus {
  return (SHIPPING_STATUSES as readonly string[]).includes(status);
}

/** Inserta o reemplaza un pedido en una lista (usado por eventos en tiempo real). */
export function upsertOrder(list: Order[] | undefined, order: Order, prepend = false): Order[] {
  const current = list ?? [];
  const exists = current.some((o) => o.id === order.id);
  if (exists) return current.map((o) => (o.id === order.id ? { ...o, ...order } : o));
  return prepend ? [order, ...current] : [...current, order];
}

export const shortId = (id: string) => `#${id.slice(-6).toUpperCase()}`;
