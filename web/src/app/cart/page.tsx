'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/Alert';
import { BookCover } from '@/components/BookCover';
import { FormatBadge } from '@/components/FormatBadge';
import { ordersApi } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useCart } from '@/lib/cart/CartProvider';
import { fill } from '@/lib/i18n/es';
import { useI18n } from '@/lib/i18n/I18nProvider';

export default function CartPage() {
  const { t, pick, formatPrice, errorMessage } = useI18n();
  const { user } = useAuth();
  const { lines, estimatedTotal, needsShipping, setQuantity, remove, clear } = useCart();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (lines.length === 0) {
    return (
      <div className="card mx-auto max-w-lg p-10 text-center">
        <h1 className="font-display text-3xl font-extrabold">{t.cart.title}</h1>
        <p className="mt-3 text-bark">{t.cart.empty}</p>
        <Link href="/catalog" className="btn btn-primary mt-6">
          {t.cart.browse}
        </Link>
      </div>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      router.push('/login?next=/cart');
      return;
    }
    const form = new FormData(event.currentTarget);
    const field = (key: string) => String(form.get(key) ?? '').trim();
    setSubmitting(true);
    setError(null);
    try {
      // Solo se envían ids y cantidades: el backend consulta precios, stock y calcula el total.
      const order = await ordersApi.create({
        items: lines.map((l) => ({ bookId: l.bookId, quantity: l.quantity })),
        shippingAddress: needsShipping
          ? { recipient: field('recipient'), line1: field('line1'), city: field('city'), phone: field('phone') }
          : undefined,
        notes: field('notes') || undefined,
      });
      clear();
      router.push(`/checkout/${order.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <section className="space-y-4">
        <header>
          <h1 className="page-title">{t.cart.title}</h1>
          <p className="mt-2 text-bark">{t.cart.subtitle}</p>
        </header>
        <ul className="space-y-3">
          {lines.map((line) => (
            <li key={line.bookId} className="card flex items-center gap-4 p-3">
              <BookCover src={line.coverUrl} title={pick(line.title)} author={line.author} compact className="aspect-[2/3] w-14 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-bold">{pick(line.title)}</p>
                <p className="flex items-center gap-2 text-xs text-bark">
                  {line.author} <FormatBadge format={line.format} />
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center rounded-full border border-bark/20 bg-white/70">
                    <button type="button" className="cursor-pointer px-3 py-1 text-lg" onClick={() => setQuantity(line.bookId, line.quantity - 1)} aria-label="-1">
                      −
                    </button>
                    <label className="sr-only" htmlFor={`qty-${line.bookId}`}>
                      {t.cart.quantity}
                    </label>
                    <input
                      id={`qty-${line.bookId}`}
                      type="number"
                      min={1}
                      max={line.stock}
                      value={line.quantity}
                      onChange={(e) => setQuantity(line.bookId, Number(e.target.value) || 1)}
                      className="w-10 bg-transparent text-center font-semibold focus:outline-none"
                    />
                    <button
                      type="button"
                      className="cursor-pointer px-3 py-1 text-lg disabled:opacity-30"
                      onClick={() => setQuantity(line.bookId, line.quantity + 1)}
                      disabled={line.quantity >= line.stock}
                      aria-label="+1"
                    >
                      +
                    </button>
                  </div>
                  {line.quantity >= line.stock && <span className="text-xs text-bark">{fill(t.cart.maxStock, { n: line.stock })}</span>}
                  <button type="button" className="cursor-pointer text-sm font-semibold text-clay hover:underline" onClick={() => remove(line.bookId)}>
                    {t.cart.remove}
                  </button>
                </div>
              </div>
              <span className="font-display text-lg font-bold text-clay">{formatPrice(line.price * line.quantity)}</span>
            </li>
          ))}
        </ul>
      </section>

      <form onSubmit={handleSubmit} className="card h-fit space-y-5 p-6 lg:sticky lg:top-24">
        {error && <Alert tone="error">{error}</Alert>}
        {user?.role === 'administrador' && <Alert tone="info">{t.cart.adminCannotOrder}</Alert>}

        {needsShipping ? (
          <fieldset className="space-y-4">
            <legend className="font-display text-xl font-bold">{t.cart.shippingTitle}</legend>
            <p className="-mt-2 text-xs text-bark">{t.cart.shippingHint}</p>
            <Field id="recipient" label={t.cart.recipient} autoComplete="name" defaultValue={user?.name} minLength={2} maxLength={100} />
            <Field id="line1" label={t.cart.address} autoComplete="street-address" placeholder={t.cart.addressPlaceholder} minLength={5} maxLength={200} />
            <div className="grid grid-cols-2 gap-3">
              <Field id="city" label={t.cart.city} autoComplete="address-level2" minLength={2} maxLength={80} />
              <Field id="phone" label={t.cart.phone} autoComplete="tel" type="tel" pattern="[+\d][\d\s\-]{6,20}" maxLength={22} />
            </div>
          </fieldset>
        ) : (
          <Alert tone="success">⬇ {t.cart.digitalOnly}</Alert>
        )}

        <div>
          <label htmlFor="notes" className="label">
            {t.cart.notes}
          </label>
          <input id="notes" name="notes" className="input" maxLength={300} placeholder={t.cart.notesPlaceholder} />
        </div>
        <div className="flex items-baseline justify-between border-t border-bark/10 pt-4">
          <span className="font-semibold">{t.cart.total}</span>
          <span className="font-display text-3xl font-extrabold text-clay">{formatPrice(estimatedTotal)}</span>
        </div>
        <p className="text-xs text-bark/80">{t.cart.estimated}</p>
        <button type="submit" className="btn btn-primary w-full py-3" disabled={submitting || user?.role === 'administrador'}>
          {submitting ? t.common.loading : user ? t.cart.checkout : t.cart.loginToContinue}
        </button>
      </form>
    </div>
  );
}

function Field({ id, label, ...props }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} name={id} className="input" required {...props} />
    </div>
  );
}
