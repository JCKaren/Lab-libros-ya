'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { OrderSummary } from '@/components/OrderSummary';
import { PaymentButtons } from '@/components/PaymentButtons';
import { StatusBadge } from '@/components/StatusBadge';
import { ApiError, ordersApi, paymentsApi } from '@/lib/api';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { shortId } from '@/lib/orderFlow';
import { useAsync } from '@/lib/useAsync';

type Feedback = { tone: 'success' | 'error' | 'info'; text: string } | null;

export function CheckoutView() {
  const { orderId } = useParams<{ orderId: string }>();
  const { t, errorMessage } = useI18n();
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const { data, error, loading, setData } = useAsync(
    () => Promise.all([ordersApi.get(orderId), paymentsApi.config()]).then(([order, config]) => ({ order, config })),
    [orderId],
  );

  if (loading && !data) return <p className="py-24 text-center text-bark">{t.common.loading}</p>;
  if (error || !data) return <Alert tone="error">{errorMessage(error)}</Alert>;

  const { order, config } = data;
  const payable = order.status === 'PENDING_PAYMENT';

  const cancel = async () => {
    try {
      await ordersApi.cancel(order.id);
      router.push('/orders');
    } catch (err) {
      setFeedback({ tone: 'error', text: errorMessage(err) });
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{t.checkout.title}</h1>
          <p className="mt-2 text-bark">{t.checkout.subtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-bark">{shortId(order.id)}</p>
          <StatusBadge status={order.status} />
        </div>
      </header>

      {feedback && <Alert tone={feedback.tone}>{feedback.text}</Alert>}

      <section className="card space-y-6 p-6">
        <OrderSummary order={order} />

        {payable ? (
          <>
            <PaymentButtons
              orderId={order.id}
              config={config}
              onPaid={(paid) => {
                setData((prev) => (prev ? { ...prev, order: paid } : prev));
                setFeedback({ tone: 'success', text: order.requiresShipping ? t.checkout.successShipping : t.checkout.successDigital });
              }}
              onCancelled={() => setFeedback({ tone: 'info', text: t.checkout.cancelled })}
              onError={(err) => setFeedback({ tone: 'error', text: err instanceof ApiError ? errorMessage(err) : t.checkout.failed })}
            />
            <button type="button" className="btn btn-ghost w-full" onClick={cancel}>
              {t.checkout.cancelOrder}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            {order.paymentStatus !== 'PAID' && <Alert tone="info">{t.checkout.notPayable}</Alert>}
            <Link href="/orders" className="btn btn-primary w-full py-3">
              {t.nav.orders}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
