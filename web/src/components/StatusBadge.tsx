'use client';

import { useI18n } from '@/lib/i18n/I18nProvider';
import type { OrderStatus } from '@/lib/types';

export const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'bg-sand text-bark',
  PENDING: 'bg-ochre/20 text-[#8a6420]',
  PREPARING: 'bg-clay/15 text-clay-dark',
  SHIPPED: 'bg-olive/20 text-moss',
  DELIVERED: 'bg-espresso/10 text-espresso',
  CANCELLED: 'bg-bark/10 text-bark line-through',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLES[status]}`}>{t.status[status]}</span>
  );
}
