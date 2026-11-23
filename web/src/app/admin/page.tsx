'use client';

import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/Alert';
import { ShippingBoard } from '@/components/admin/ShippingBoard';
import { LiveIndicator } from '@/components/LiveIndicator';
import { RoleGuard } from '@/components/RoleGuard';
import { ordersApi } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { shortId, upsertOrder } from '@/lib/orderFlow';
import { useRealtime } from '@/lib/realtime/useRealtime';
import type { Order, ShippingStatus } from '@/lib/types';
import { useAsync } from '@/lib/useAsync';

function ShippingDashboard() {
  const { t, errorMessage } = useI18n();
  const { token } = useAuth();
  const { data: orders, error, loading, reload, setData } = useAsync(() => ordersApi.shipping(), []);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [shipping, setShipping] = useState<Order | null>(null);

  const upsert = (order: Order) => setData((prev) => upsertOrder(prev, order));
  const { connected } = useRealtime({
    token,
    handlers: {
      'order:created': (order) => {
        upsert(order);
        setNotice({ tone: 'info', text: `${t.shipping.newOrder} ${shortId(order.id)}` });
      },
      'order:statusChanged': upsert,
    },
    onSync: reload,
  });

  const setPending = (id: string, on: boolean) =>
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  /** Actualización optimista: se revierte si el servidor rechaza el cambio. */
  const move = async (order: Order, to: ShippingStatus, shipment?: { carrier?: string; trackingNumber?: string }) => {
    setPending(order.id, true);
    setNotice(null);
    upsert({ ...order, status: to });
    try {
      upsert(await ordersApi.changeStatus(order.id, to, shipment));
    } catch (err) {
      upsert(order);
      setNotice({ tone: 'error', text: errorMessage(err) });
    } finally {
      setPending(order.id, false);
    }
  };

  const requestMove = (order: Order, to: ShippingStatus) => {
    if (to === 'SHIPPED' && order.status === 'PREPARING') setShipping(order);
    else void move(order, to);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{t.shipping.title}</h1>
          <p className="mt-2 text-bark">{t.shipping.subtitle}</p>
        </div>
        <LiveIndicator connected={connected} />
      </header>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      {error ? (
        <Alert tone="error">
          {errorMessage(error)}{' '}
          <button type="button" className="font-bold underline" onClick={reload}>
            {t.common.retry}
          </button>
        </Alert>
      ) : loading && !orders ? (
        <p className="text-bark">{t.common.loading}</p>
      ) : (
        <ShippingBoard
          orders={orders ?? []}
          onMove={requestMove}
          onInvalidMove={() => setNotice({ tone: 'error', text: t.shipping.invalidMove })}
          pendingIds={pendingIds}
        />
      )}

      {shipping && (
        <ShipDialog
          order={shipping}
          onClose={() => setShipping(null)}
          onConfirm={(shipment) => {
            setShipping(null);
            void move(shipping, 'SHIPPED', shipment);
          }}
        />
      )}
    </div>
  );
}

function ShipDialog({
  order,
  onClose,
  onConfirm,
}: {
  order: Order;
  onClose: () => void;
  onConfirm: (shipment: { carrier?: string; trackingNumber?: string }) => void;
}) {
  const { t } = useI18n();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim() || undefined;
    onConfirm({ carrier: value('carrier'), trackingNumber: value('trackingNumber') });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-espresso/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ship-title"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-6">
        <div>
          <h2 id="ship-title" className="font-display text-2xl font-bold">
            {t.shipping.dialogTitle} {shortId(order.id)}
          </h2>
          <p className="mt-1 text-sm text-bark">{t.shipping.dialogHint}</p>
        </div>
        <div>
          <label htmlFor="carrier" className="label">
            {t.shipping.carrier}
          </label>
          <input id="carrier" name="carrier" className="input" maxLength={60} autoFocus defaultValue={order.shipment?.carrier} />
        </div>
        <div>
          <label htmlFor="trackingNumber" className="label">
            {t.shipping.trackingNumber}
          </label>
          <input id="trackingNumber" name="trackingNumber" className="input font-mono" maxLength={60} defaultValue={order.shipment?.trackingNumber} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t.shipping.cancel}
          </button>
          <button type="submit" className="btn btn-primary">
            {t.shipping.confirm}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminPage() {
  return (
    <RoleGuard role="administrador">
      <ShippingDashboard />
    </RoleGuard>
  );
}
