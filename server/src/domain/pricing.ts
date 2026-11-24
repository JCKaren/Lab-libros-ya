import { fromCents, toCents } from '../utils/money';
import type { Book, OrderItem } from './entities';

export type CatalogBook = Pick<Book, 'id' | 'title' | 'author' | 'format' | 'price' | 'stock' | 'active' | 'downloadUrl'>;

export interface RequestedItem {
  bookId: string;
  quantity: number;
}

export type PricingErrorCode = 'BOOK_NOT_FOUND' | 'BOOK_UNAVAILABLE' | 'OUT_OF_STOCK' | 'INVALID_QUANTITY';

export class PricingError extends Error {
  constructor(
    public readonly code: PricingErrorCode,
    public readonly bookId: string,
  ) {
    super(code);
  }
}

/**
 * Calcula líneas y total usando SOLO datos del catálogo (fuente de verdad del servidor).
 * Agrupa ítems repetidos, valida stock y guarda un snapshot del precio en cada línea.
 */
/** Línea calculada; el contador de descargas lo inicializa el repositorio. */
export type PricedLine = Omit<OrderItem, 'downloads'>;

export function priceOrder(requested: RequestedItem[], catalog: CatalogBook[]): { lines: PricedLine[]; total: number } {
  const byId = new Map(catalog.map((b) => [b.id, b]));
  const merged = new Map<string, number>();

  for (const item of requested) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) throw new PricingError('INVALID_QUANTITY', item.bookId);
    merged.set(item.bookId, (merged.get(item.bookId) ?? 0) + item.quantity);
  }

  let totalCents = 0;
  const lines: PricedLine[] = [];

  for (const [bookId, quantity] of merged) {
    const book = byId.get(bookId);
    if (!book) throw new PricingError('BOOK_NOT_FOUND', bookId);
    if (!book.active) throw new PricingError('BOOK_UNAVAILABLE', bookId);
    if (book.stock < quantity) throw new PricingError('OUT_OF_STOCK', bookId);
    const subtotalCents = toCents(book.price) * quantity;
    totalCents += subtotalCents;
    lines.push({
      bookId,
      title: book.title,
      author: book.author,
      format: book.format,
      unitPrice: book.price,
      quantity,
      subtotal: fromCents(subtotalCents),
      downloadUrl: book.format === 'ebook' && book.downloadUrl ? book.downloadUrl : undefined,
    });
  }

  return { lines, total: fromCents(totalCents) };
}
