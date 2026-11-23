'use client';

import { useI18n } from '@/lib/i18n/I18nProvider';

export function LiveIndicator({ connected }: { connected: boolean }) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
        connected ? 'bg-olive/15 text-moss' : 'bg-sand text-bark'
      }`}
      aria-live="polite"
    >
      <span className={`size-2 rounded-full ${connected ? 'animate-pulse bg-olive' : 'bg-bark/40'}`} />
      {connected ? t.orders.live : t.orders.reconnecting}
    </span>
  );
}
