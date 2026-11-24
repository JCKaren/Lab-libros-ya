import type { Role } from './roles';

/**
 * Máquina de estados explícita del pedido.
 *
 *  PENDING_PAYMENT ──(pago verificado, hay impresos)──► PENDING ─► PREPARING ─► SHIPPED ─► DELIVERED
 *        │
 *        └──────────(pago verificado, solo e-books)───────────────────────────────────────► DELIVERED
 *
 * Solo el sistema (tras una captura verificada) sale de PENDING_PAYMENT.
 */
export const ORDER_STATUSES = ['PENDING_PAYMENT', 'PENDING', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Columnas del tablero de envíos. */
export const SHIPPING_STATUSES = ['PENDING', 'PREPARING', 'SHIPPED', 'DELIVERED'] as const satisfies readonly OrderStatus[];
export type ShippingStatus = (typeof SHIPPING_STATUSES)[number];

/**
 * Pago en el proveedor:
 *  CREATED ─► CAPTURING ─► CAPTURED
 *                 │  ├──► PENDING (revisión del proveedor; se concilia después)
 *                 │  └──► FAILED
 *                 └─────► REFUNDED (cobro que no se pudo verificar: se reembolsa)
 */
export const PAYMENT_STATUSES = ['CREATED', 'APPROVED', 'CAPTURING', 'PENDING', 'CAPTURED', 'FAILED', 'REFUNDED', 'CANCELLED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Estado de cobro del pedido. PROCESSING es el candado a nivel de pedido:
 * mientras exista, nadie puede cancelar el pedido ni iniciar otra captura.
 */
export const ORDER_PAYMENT_STATUSES = ['UNPAID', 'PROCESSING', 'PAID'] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

export type Actor = Role | 'system';

/**
 * Transiciones permitidas por actor. El administrador avanza un paso o
 * retrocede uno para corregir; nunca salta de Pendiente a Entregado.
 */
const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, readonly Actor[]>>> = {
  PENDING_PAYMENT: { PENDING: ['system'], DELIVERED: ['system'], CANCELLED: ['system', 'cliente'] },
  PENDING: { PREPARING: ['administrador'] },
  PREPARING: { SHIPPED: ['administrador'], PENDING: ['administrador'] },
  SHIPPED: { DELIVERED: ['administrador'], PREPARING: ['administrador'] },
  DELIVERED: {},
  CANCELLED: {},
};

export function canTransition(from: OrderStatus, to: OrderStatus, actor: Actor): boolean {
  return TRANSITIONS[from][to]?.includes(actor) ?? false;
}

export function allowedTransitions(from: OrderStatus, actor: Actor): OrderStatus[] {
  return (Object.entries(TRANSITIONS[from]) as [OrderStatus, readonly Actor[]][])
    .filter(([, actors]) => actors.includes(actor))
    .map(([to]) => to);
}

/** Estado al que pasa un pedido cuando el pago queda verificado. */
export const statusAfterPayment = (needsShipping: boolean): OrderStatus => (needsShipping ? 'PENDING' : 'DELIVERED');
