'use client';

import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/Alert';
import { BookCover } from '@/components/BookCover';
import { FormatBadge } from '@/components/FormatBadge';
import { LiveIndicator } from '@/components/LiveIndicator';
import { RoleGuard } from '@/components/RoleGuard';
import { booksApi } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { useRealtime } from '@/lib/realtime/useRealtime';
import { BOOK_CATEGORIES, BOOK_FORMATS, LOW_STOCK_THRESHOLD, type Book, type BookCategory, type BookFormat, type BookInput } from '@/lib/types';
import { useAsync } from '@/lib/useAsync';

type Notice = { tone: 'success' | 'error'; text: string } | null;

function CatalogManager() {
  const { t, errorMessage } = useI18n();
  const { token } = useAuth();
  const { data: books, error, loading, reload, setData } = useAsync(() => booksApi.list({ all: true }), []);
  const [notice, setNotice] = useState<Notice>(null);

  const replace = (book: Book) => setData((prev) => prev?.map((b) => (b.id === book.id ? book : b)));

  // Observer: las ventas descuentan stock en el servidor y llegan aquí en vivo.
  const { connected } = useRealtime({
    token,
    handlers: {
      'book:stockChanged': ({ id, stock }) => setData((prev) => prev?.map((b) => (b.id === id ? { ...b, stock } : b))),
    },
    onSync: reload,
  });

  /** Ejecuta una acción mostrando el error traducido; devuelve si tuvo éxito. */
  const run = async (action: () => Promise<void>): Promise<boolean> => {
    setNotice(null);
    try {
      await action();
      return true;
    } catch (err) {
      setNotice({ tone: 'error', text: errorMessage(err) });
      return false;
    }
  };

  const list = books ?? [];
  const stats = [
    { label: t.manage.totalBooks, value: list.length },
    { label: t.manage.totalUnits, value: list.reduce((sum, b) => sum + b.stock, 0) },
    { label: t.manage.lowStockCount, value: list.filter((b) => b.stock <= LOW_STOCK_THRESHOLD).length },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{t.manage.title}</h1>
          <p className="mt-2 text-bark">{t.manage.subtitle}</p>
        </div>
        <LiveIndicator connected={connected} />
      </header>

      <section className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card p-4 text-center">
            <p className="font-display text-3xl font-extrabold text-clay">{s.value}</p>
            <p className="text-xs font-semibold text-bark uppercase">{s.label}</p>
          </div>
        ))}
      </section>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <div className="grid gap-8 lg:grid-cols-[1fr_1.5fr]">
        <BookForm
          onCreate={(input) =>
            run(async () => {
              const book = await booksApi.create(input);
              setData((prev) => [book, ...(prev ?? [])]);
              setNotice({ tone: 'success', text: t.manage.saved });
            })
          }
        />

        <section className="space-y-3">
          {error ? (
            <Alert tone="error">{errorMessage(error)}</Alert>
          ) : loading && !books ? (
            <p className="text-bark">{t.common.loading}</p>
          ) : (
            <ul className="space-y-3">
              {list.map((book) => (
                <BookRow
                  key={book.id}
                  book={book}
                  onAdjust={(delta) => run(async () => replace(await booksApi.adjustStock(book.id, delta)))}
                  onToggle={() => run(async () => replace(await booksApi.update(book.id, { active: !book.active })))}
                  onDelete={() =>
                    run(async () => {
                      if (!window.confirm(t.manage.confirmDelete)) return;
                      await booksApi.remove(book.id);
                      setData((prev) => prev?.filter((b) => b.id !== book.id));
                    })
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function BookRow({ book, onAdjust, onToggle, onDelete }: { book: Book; onAdjust: (delta: number) => Promise<boolean>; onToggle: () => void; onDelete: () => void }) {
  const { t, pick, formatPrice } = useI18n();
  const [delta, setDelta] = useState('');
  const low = book.stock <= LOW_STOCK_THRESHOLD;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(delta);
    if (!Number.isInteger(value) || value === 0) return;
    if (await onAdjust(value)) setDelta('');
  };

  return (
    <li className={`card flex flex-wrap items-center gap-4 p-3 ${book.active ? '' : 'opacity-60'}`}>
      <BookCover src={book.coverUrl} title={pick(book.title)} author={book.author} compact className="aspect-[2/3] w-12 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display font-bold">{pick(book.title)}</p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-bark">
          {book.author} · {formatPrice(book.price)} <FormatBadge format={book.format} />
        </p>
        <p className={`mt-1 text-sm font-semibold ${low ? 'text-clay-dark' : 'text-moss'}`}>
          {t.manage.stockLabel}: {book.stock} {low && `· ${t.manage.lowStock}`}
        </p>
      </div>
      <form onSubmit={submit} className="flex items-center gap-1">
        <label className="sr-only" htmlFor={`delta-${book.id}`}>
          {t.manage.adjust}
        </label>
        <input
          id={`delta-${book.id}`}
          type="number"
          step={1}
          className="input w-20 py-1.5"
          placeholder="±"
          title={t.manage.adjustHint}
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
        />
        <button type="submit" className="btn btn-secondary px-3 py-1.5 text-xs">
          {t.manage.adjust}
        </button>
      </form>
      <label className="flex cursor-pointer items-center gap-1 text-xs font-semibold">
        <input type="checkbox" checked={book.active} onChange={onToggle} className="accent-clay" />
        {t.manage.active}
      </label>
      <button type="button" className="cursor-pointer text-xs font-semibold text-clay hover:underline" onClick={onDelete}>
        {t.manage.delete}
      </button>
    </li>
  );
}

function BookForm({ onCreate }: { onCreate: (input: BookInput) => Promise<boolean> }) {
  const { t } = useI18n();
  const [format, setFormat] = useState<BookFormat>('ebook');
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const v = (key: string) => String(form.get(key) ?? '').trim();
    setSaving(true);
    const ok = await onCreate({
      title: { es: v('titleEs'), en: v('titleEn') },
      description: { es: v('descEs'), en: v('descEn') },
      author: v('author'),
      category: v('category') as BookCategory,
      format,
      isbn: v('isbn'),
      price: Number(v('price')),
      stock: Number(v('stock')),
      coverUrl: v('coverUrl'),
      downloadUrl: format === 'ebook' ? v('downloadUrl') : '',
      active: form.get('active') === 'on',
    });
    setSaving(false);
    if (ok) {
      formEl.reset();
      setFormat('ebook');
    }
  };

  const input = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input id={name} name={name} className="input" {...props} />
    </div>
  );

  return (
    <form onSubmit={submit} className="card h-fit space-y-4 p-6 lg:sticky lg:top-24">
      <h2 className="font-display text-2xl font-bold">{t.manage.newBook}</h2>
      <div className="grid grid-cols-2 gap-3">
        {input('titleEs', t.manage.titleEs, { required: true, maxLength: 150 })}
        {input('titleEn', t.manage.titleEn, { required: true, maxLength: 150 })}
      </div>
      {input('author', t.manage.author, { required: true, maxLength: 120 })}
      <div className="grid grid-cols-2 gap-3">
        {(['descEs', 'descEn'] as const).map((name) => (
          <div key={name}>
            <label htmlFor={name} className="label">
              {t.manage[name]}
            </label>
            <textarea id={name} name={name} className="input min-h-20" required maxLength={600} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="category" className="label">
            {t.manage.category}
          </label>
          <select id="category" name="category" className="input">
            {BOOK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t.categories[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="format" className="label">
            {t.manage.format}
          </label>
          <select id="format" className="input" value={format} onChange={(e) => setFormat(e.target.value as BookFormat)}>
            {BOOK_FORMATS.map((f) => (
              <option key={f} value={f}>
                {t.formats[f]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {input('isbn', t.manage.isbn, { maxLength: 20 })}
        {input('price', t.manage.price, { required: true, type: 'number', min: 0.01, step: 0.01, max: 10000 })}
        {input('stock', t.manage.stock, { required: true, type: 'number', min: 0, step: 1, defaultValue: 10 })}
      </div>
      {input('coverUrl', t.manage.coverUrl, { type: 'url', maxLength: 500 })}
      {format === 'ebook' && input('downloadUrl', t.manage.downloadUrl, { type: 'url', maxLength: 500 })}
      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="active" defaultChecked className="accent-clay" />
        {t.manage.active}
      </label>
      <button type="submit" className="btn btn-primary w-full" disabled={saving}>
        {saving ? t.common.loading : t.manage.save}
      </button>
    </form>
  );
}

export default function AdminCatalogPage() {
  return (
    <RoleGuard role="administrador">
      <CatalogManager />
    </RoleGuard>
  );
}
