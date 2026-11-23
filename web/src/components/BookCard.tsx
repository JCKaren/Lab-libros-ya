'use client';

import { useState } from 'react';
import { fill } from '@/lib/i18n/es';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { LOW_STOCK_THRESHOLD, type Book } from '@/lib/types';
import { BookCover } from './BookCover';
import { FormatBadge } from './FormatBadge';

interface Props {
  book: Book;
  /** Si no se pasa, no se muestra el botón de añadir (ej. vista de administrador). */
  onAdd?: (book: Book) => void;
}

export function BookCard({ book, onAdd }: Props) {
  const { t, pick, formatPrice } = useI18n();
  const [justAdded, setJustAdded] = useState(false);
  const title = pick(book.title);
  const soldOut = book.stock < 1;
  const lowStock = !soldOut && book.format === 'impreso' && book.stock <= LOW_STOCK_THRESHOLD;

  const handleAdd = () => {
    onAdd?.(book);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1200);
  };

  return (
    <article className="card group flex flex-col overflow-hidden">
      <div className="relative bg-sand/60 p-5">
        <BookCover
          src={book.coverUrl}
          title={title}
          author={book.author}
          className="mx-auto aspect-[2/3] w-36 rounded-r-lg rounded-l-sm shadow-[6px_8px_18px_-6px_rgb(46_33_26/0.55)] transition duration-500 group-hover:-translate-y-1 group-hover:rotate-[-1deg]"
        />
        <FormatBadge format={book.format} className="absolute top-3 left-3" />
        <span className="absolute top-3 right-3 rounded-full bg-cream/90 px-2.5 py-0.5 text-[11px] font-bold text-bark">
          {t.categories[book.category]}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-lg leading-tight font-bold">{title}</h3>
        <p className="mt-0.5 text-sm text-bark">
          {t.catalog.by} {book.author}
        </p>
        <p className="mt-2 line-clamp-3 flex-1 text-sm text-bark/90">{pick(book.description)}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="font-display text-xl font-extrabold text-clay">{formatPrice(book.price)}</span>
          {lowStock && <span className="text-xs font-bold text-clay-dark">{fill(t.catalog.lastUnits, { n: book.stock })}</span>}
        </div>
        {onAdd && (
          <button type="button" className="btn btn-primary mt-3" onClick={handleAdd} disabled={soldOut}>
            {soldOut ? t.catalog.outOfStock : justAdded ? `✓ ${t.catalog.added}` : `+ ${t.catalog.add}`}
          </button>
        )}
      </div>
    </article>
  );
}
