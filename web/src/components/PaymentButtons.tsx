'use client';

import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import { useState } from 'react';
import { paymentsApi } from '@/lib/api';
import { useI18n } from '@/lib/i18n/I18nProvider';
import type { Order, PaymentConfig } from '@/lib/types';

interface Props {
  orderId: string;
  config: PaymentConfig;
  onPaid: (order: Order) => void;
  onCancelled: () => void;
  onError: (err: unknown) => void;
}

/**
 * El frontend nunca marca el pedido como pagado: solo pide al backend que cree
 * y capture la orden. El backend verifica todo con PayPal.
 */
export function PaymentButtons({ orderId, config, onPaid, onCancelled, onError }: Props) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);

  if (config.provider === 'mock') {
    const simulate = async () => {
      setBusy(true);
      try {
        const { providerOrderId } = await paymentsApi.createOrder(orderId);
        onPaid(await paymentsApi.capture(orderId, providerOrderId));
      } catch (err) {
        onError(err);
      } finally {
        setBusy(false);
      }
    };
    return (
      <div className="space-y-3">
        <p className="rounded-2xl bg-sand px-4 py-3 text-xs text-bark">{t.checkout.mockNotice}</p>
        <button type="button" className="btn btn-primary w-full py-3" onClick={simulate} disabled={busy}>
          {busy ? t.checkout.paying : t.checkout.mockPay}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-bark/80">{t.checkout.sandboxNotice}</p>
      {busy && <p className="text-sm font-semibold text-bark">{t.checkout.paying}</p>}
      <PayPalScriptProvider
        options={{ clientId: config.clientId, currency: config.currency, intent: 'capture', locale: locale === 'es' ? 'es_ES' : 'en_US' }}
      >
        <PayPalButtons
          style={{ layout: 'vertical', color: 'gold', shape: 'pill', label: 'pay' }}
          disabled={busy}
          createOrder={async () => (await paymentsApi.createOrder(orderId)).providerOrderId}
          onApprove={async (data) => {
            setBusy(true);
            try {
              onPaid(await paymentsApi.capture(orderId, data.orderID));
            } catch (err) {
              onError(err);
            } finally {
              setBusy(false);
            }
          }}
          onCancel={onCancelled}
          onError={(err) => onError(err)}
        />
      </PayPalScriptProvider>
    </div>
  );
}
