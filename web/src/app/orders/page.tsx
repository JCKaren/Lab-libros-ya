'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { FormatBadge } from '@/components/FormatBadge';
import { LiveIndicator } from '@/components/LiveIndicator';
import { RoleGuard } from '@/components/RoleGuard';
import { StatusBadge } from '@/components/StatusBadge';
import { ordersApi } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';
import { fill } from '@/lib/i18n/es';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { shortId, upsertOrder } from '@/lib/orderFlow';
import { useRealtime } from '@/lib/realtime/useRealtime';
import type { Order } from '@/lib/types';
import { useAsync } from '@/lib/useAsync';

function OrdersList() {
  const { t, errorMessage } = useI18n();
  const { token } = useAuth();
  const { data: orders, error, loading, reload, setData } = useAsync(() => ordersApi.mine(), []);

  const { connected } = useRealtime({
    token,
    handlers: { 'order:updated': (order) => setData((prev) => upsertOrder(prev, order, true)) },
    onSync: reload,
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{t.orders.title}</h1>
          <p className="mt-2 text-bark">{t.orders.subtitle}</p>
        </div>
        <LiveIndicator connected={connected} />
      </header>

      {error ? (
        <Alert tone="error">{errorMessage(error)}</Alert>
      ) : loading && !orders ? (
        <p className="text-bark">{t.common.loading}</p>
      ) : !orders?.length ? (
        <div className="card p-10 text-center">
          <p className="text-bark">{t.orders.empty}</p>
          <Link href="/catalog" className="btn btn-primary mt-4">
            {t.cart.browse}
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Pide un enlace firmado y lo abre en otra pestaña (la URL permanente nunca llega al navegador). */
function DownloadButton({ orderId, bookId, left }: { orderId: string; bookId: string; left: number }) {
  const { t, errorMessage } = useI18n();
  const [remaining, setRemaining] = useState(left);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    // Se abre la pestaña de inmediato (gesto del usuario) para que el navegador no la bloquee.
    const tab = window.open('about:blank', '_blank');
    setBusy(true);
    setError(null);
    try {
      const { url, downloadsLeft } = await ordersApi.download(orderId, bookId);
      setRemaining(downloadsLeft);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else window.location.assign(url);
    } catch (err) {
      tab?.close();
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        onClick={download}
        disabled={busy || remaining <= 0}
        className="cursor-pointer font-semibold text-moss hover:underline disabled:cursor-not-allowed disabled:opacity-50"
      >
        ⬇ {t.orders.download}
      </button>
      <span className="text-[11px] text-bark">{fill(t.orders.downloadsLeft, { n: remaining })}</span>
      {error && <span className="text-[11px] text-clay-dark">{error}</span>}
    </span>
  );
}

function OrderCard({ order }: { order: Order }) {
  const { t, pick, formatPrice, formatDate } = useI18n();
  const paid = order.paymentStatus === 'PAID';
  const { carrier, trackingNumber } = order.shipment ?? {};

  return (
    <li className="card flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold">
            {t.orders.order} {shortId(order.id)}
          </p>
          <p className="text-sm text-bark">{formatDate(order.createdAt)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <ul className="mt-4 space-y-2 text-sm">
        {order.items.map((item) => (
          <li key={item.bookId} className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2">
              {item.quantity}× {pick(item.title)} <FormatBadge format={item.format} />
            </span>
            {item.format === 'ebook' && paid &&
              (item.downloadable ? (
                <DownloadButton orderId={order.id} bookId={item.bookId} left={item.downloadsLeft ?? 0} />
              ) : (
                <span className="text-xs text-bark">{t.orders.downloadSoon}</span>
              ))}
          </li>
        ))}
      </ul>

      {order.requiresShipping && order.shippingAddress && (
        <div className="mt-3 rounded-xl bg-sand/50 p-3 text-sm text-bark">
          <p>
            {t.checkout.shipTo}: <strong className="text-espresso">{order.shippingAddress.line1}, {order.shippingAddress.city}</strong>
          </p>
          {(carrier || trackingNumber) && (
            <p className="mt-1">
              {carrier && (
                <>
                  {t.orders.carrier}: <strong className="text-espresso">{carrier}</strong>
                </>
              )}
              {carrier && trackingNumber && ' · '}
              {trackingNumber && (
                <>
                  {t.orders.tracking}: <strong className="font-mono text-espresso">{trackingNumber}</strong>
                </>
              )}
            </p>
          )}
        </div>
      )}
      {!order.requiresShipping && <p className="mt-3 text-xs font-semibold text-moss">⬇ {t.checkout.digitalDelivery}</p>}
      {order.paymentStatus === 'PROCESSING' && (
        <p className="mt-3 rounded-xl bg-ochre/15 p-3 text-xs font-semibold text-bark">⏳ {t.orders.processing}</p>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
        <span className="font-display text-2xl font-extrabold text-clay">{formatPrice(order.total, order.currency)}</span>
        {order.status === 'PENDING_PAYMENT' && order.paymentStatus === 'UNPAID' && (
          <Link href={`/checkout/${order.id}`} className="btn btn-primary">
            {t.orders.pay}
          </Link>
        )}
      </div>
    </li>
  );
}

export default function OrdersPage() {
  return (
    <RoleGuard role="cliente">
      <OrdersList />
    </RoleGuard>
  );
}
