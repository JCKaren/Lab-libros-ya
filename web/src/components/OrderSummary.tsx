'use client';

import { useI18n } from '@/lib/i18n/I18nProvider';
import type { Order } from '@/lib/types';
import { FormatBadge } from './FormatBadge';

export function OrderSummary({ order }: { order: Order }) {
  const { t, pick, formatPrice } = useI18n();
  const address = order.shippingAddress;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-bark/10">
        {order.items.map((item) => (
          <li key={item.bookId} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              {item.quantity}× {pick(item.title)} <FormatBadge format={item.format} />
            </span>
            <span className="font-semibold">{formatPrice(item.subtotal, order.currency)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t border-bark/10 pt-3">
        <span className="font-semibold">{t.checkout.total}</span>
        <span className="font-display text-2xl font-extrabold text-clay">{formatPrice(order.total, order.currency)}</span>
      </div>
      {address ? (
        <p className="text-sm text-bark">
          {t.checkout.shipTo}:{' '}
          <strong className="text-espresso">
            {address.recipient} · {address.line1}, {address.city} · {address.phone}
          </strong>
        </p>
      ) : (
        <p className="text-sm font-semibold text-moss">⬇ {t.checkout.digitalDelivery}</p>
      )}
    </div>
  );
}
