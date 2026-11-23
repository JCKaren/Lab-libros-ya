'use client';

import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { BookCard } from '@/components/BookCard';
import { booksApi } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useCart } from '@/lib/cart/CartProvider';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { BOOK_CATEGORIES, BOOK_FORMATS, type BookCategory, type BookFormat } from '@/lib/types';
import { useAsync } from '@/lib/useAsync';
import { useDebounced } from '@/lib/useDebounced';

export default function CatalogPage() {
  const { t, errorMessage } = useI18n();
  const { user } = useAuth();
  const { add } = useCart();
  const [category, setCategory] = useState<BookCategory | undefined>();
  const [format, setFormat] = useState<BookFormat | undefined>();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());

  const { data: books, error, loading, reload } = useAsync(() => booksApi.list({ category, format, q }), [category, format, q]);

  const canBuy = user?.role !== 'administrador';
  const chip = (active: boolean) =>
    `cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition ${active ? 'bg-espresso text-cream' : 'bg-white/60 text-bark hover:bg-sand'}`;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{t.catalog.title}</h1>
          <p className="mt-2 text-bark">{t.catalog.subtitle}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <label className="sr-only" htmlFor="search">
            {t.catalog.search}
          </label>
          <input
            id="search"
            type="search"
            className="input sm:w-72"
            placeholder={t.catalog.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={80}
          />
          <select
            aria-label={t.manage.format}
            className="input sm:w-48"
            value={format ?? ''}
            onChange={(e) => setFormat((e.target.value || undefined) as BookFormat | undefined)}
          >
            <option value="">{t.catalog.allFormats}</option>
            {BOOK_FORMATS.map((f) => (
              <option key={f} value={f}>
                {t.formats[f]}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist">
        <button type="button" role="tab" aria-selected={!category} className={chip(!category)} onClick={() => setCategory(undefined)}>
          {t.catalog.all}
        </button>
        {BOOK_CATEGORIES.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={category === c} className={chip(category === c)} onClick={() => setCategory(c)}>
            {t.categories[c]}
          </button>
        ))}
      </div>

      {error ? (
        <Alert tone="error">
          {errorMessage(error)}{' '}
          <button type="button" className="font-bold underline" onClick={reload}>
            {t.common.retry}
          </button>
        </Alert>
      ) : loading && !books ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card h-[26rem] animate-pulse bg-sand/60" />
          ))}
        </div>
      ) : books?.length === 0 ? (
        <p className="text-bark">{t.catalog.empty}</p>
      ) : (
        <div className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${loading ? 'opacity-60' : ''}`}>
          {books?.map((book) => <BookCard key={book.id} book={book} onAdd={canBuy ? add : undefined} />)}
        </div>
      )}
    </div>
  );
}
