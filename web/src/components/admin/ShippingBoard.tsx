'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { canMove, isShippingStatus, shortId } from '@/lib/orderFlow';
import { SHIPPING_STATUSES, type Order, type ShippingStatus } from '@/lib/types';

interface Props {
  orders: Order[];
  /** Petición de mover un pedido; la página decide (p. ej. pedir guía para SHIPPED). */
  onMove: (order: Order, to: ShippingStatus) => void;
  /** Movimiento no permitido por la regla de un paso. */
  onInvalidMove: () => void;
  pendingIds: ReadonlySet<string>;
}

const COLUMN_TONE: Record<ShippingStatus, string> = {
  PENDING: 'border-ochre/50',
  PREPARING: 'border-clay/50',
  SHIPPED: 'border-olive/50',
  DELIVERED: 'border-moss/50',
};

/** Tablero Kanban de envíos: arrastrar y soltar (ratón, táctil y teclado) + botones accesibles. */
export function ShippingBoard({ orders, onMove, onInvalidMove, pendingIds }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const order = orders.find((o) => o.id === active.id);
    const to = String(over.id);
    if (!order || !isShippingStatus(order.status) || !isShippingStatus(to) || order.status === to) return;
    if (!canMove(order.status, to)) {
      onInvalidMove();
      return;
    }
    onMove(order, to);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {SHIPPING_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            orders={orders.filter((o) => o.status === status)}
            onMove={onMove}
            pendingIds={pendingIds}
          />
        ))}
      </div>
    </DndContext>
  );
}

function Column({
  status,
  orders,
  onMove,
  pendingIds,
}: {
  status: ShippingStatus;
  orders: Order[];
  onMove: Props['onMove'];
  pendingIds: Props['pendingIds'];
}) {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      aria-label={t.status[status]}
      className={`flex min-h-64 flex-col rounded-2xl border-2 border-dashed bg-white/40 p-3 transition ${COLUMN_TONE[status]} ${isOver ? 'bg-sand/70' : ''}`}
    >
      <header className="mb-3 flex items-center justify-between px-1">
        <h2 className="font-display text-lg font-bold">{t.status[status]}</h2>
        <span className="rounded-full bg-espresso px-2 py-0.5 text-xs font-bold text-cream">{orders.length}</span>
      </header>
      <ul className="flex flex-1 flex-col gap-3">
        {orders.length === 0 ? (
          <li className="py-8 text-center text-sm text-bark/70">{t.shipping.emptyColumn}</li>
        ) : (
          orders.map((order) => <OrderCard key={order.id} order={order} onMove={onMove} pending={pendingIds.has(order.id)} />)
        )}
      </ul>
    </section>
  );
}

function OrderCard({ order, onMove, pending }: { order: Order; onMove: Props['onMove']; pending: boolean }) {
  const { t, pick, formatPrice, formatDate } = useI18n();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: order.id, disabled: pending });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  const status = order.status as ShippingStatus;
  const index = SHIPPING_STATUSES.indexOf(status);
  const prev = index > 0 && status !== 'DELIVERED' ? SHIPPING_STATUSES[index - 1] : undefined;
  const next = index < SHIPPING_STATUSES.length - 1 ? SHIPPING_STATUSES[index + 1] : undefined;
  const address = order.shippingAddress;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`card touch-none p-3 text-sm select-none ${isDragging ? 'z-10 rotate-1 shadow-2xl' : ''} ${pending ? 'opacity-50' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-display font-bold">{shortId(order.id)}</span>
        <span className="text-xs text-bark">{formatDate(order.createdAt)}</span>
      </div>
      {order.customerName && <p className="font-semibold">{order.customerName}</p>}
      <ul className="mt-2 space-y-0.5 text-xs text-bark">
        {order.items.map((item) => (
          <li key={item.bookId}>
            {item.quantity}× {pick(item.title)}
            {item.format === 'ebook' && ' (e-book)'}
          </li>
        ))}
      </ul>
      {address && (
        <p className="mt-2 rounded-lg bg-sand/50 p-2 text-xs">
          <strong>{address.recipient}</strong>
          <br />
          {address.line1}, {address.city}
          <br />
          {address.phone}
        </p>
      )}
      {order.notes && (
        <p className="mt-2 text-xs italic">
          {t.shipping.notes}: {order.notes}
        </p>
      )}
      {(order.shipment?.carrier || order.shipment?.trackingNumber) && (
        <p className="mt-2 text-xs">
          🚚 {order.shipment.carrier} <span className="font-mono">{order.shipment.trackingNumber}</span>
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="font-bold text-clay">{formatPrice(order.total, order.currency)}</span>
        <div className="flex gap-1">
          {prev && (
            <button
              type="button"
              className="btn btn-ghost px-2 py-1 text-xs"
              disabled={pending}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onClick={() => onMove(order, prev)}
              aria-label={`${shortId(order.id)} → ${t.status[prev]}`}
            >
              ←
            </button>
          )}
          {next && (
            <button
              type="button"
              className="btn btn-secondary px-2 py-1 text-xs"
              disabled={pending}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onClick={() => onMove(order, next)}
              aria-label={`${shortId(order.id)} → ${t.status[next]}`}
            >
              {t.status[next]} →
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
