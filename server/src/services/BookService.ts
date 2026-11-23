import type { BookCategory, BookFormat } from '../domain/catalog';
import type { Book } from '../domain/entities';
import type { BookInput, BookRepository } from '../repositories/BookRepository';
import { AppError } from '../utils/AppError';
import type { OrderNotifier } from './OrderNotifier';

export interface BookListOptions {
  category?: BookCategory;
  format?: BookFormat;
  search?: string;
  includeInactive?: boolean;
}

/** Gestión del catálogo y del stock (casos de uso del administrador). */
export class BookService {
  constructor(
    private readonly books: BookRepository,
    private readonly notifier: OrderNotifier,
  ) {}

  /** El público solo ve libros activos; el administrador puede ver todo el catálogo. */
  list(options: BookListOptions): Promise<Book[]> {
    return this.books.list({
      category: options.category,
      format: options.format,
      search: options.search,
      onlyActive: !options.includeInactive,
    });
  }

  async get(id: string, options: { includeInactive?: boolean } = {}): Promise<Book> {
    const book = await this.books.findById(id);
    if (!book || (!book.active && !options.includeInactive)) throw AppError.notFound('Libro');
    return book;
  }

  create(input: BookInput): Promise<Book> {
    return this.books.create(input);
  }

  async update(id: string, input: Partial<BookInput>): Promise<Book> {
    const book = await this.books.update(id, input);
    if (!book) throw AppError.notFound('Libro');
    if (input.stock !== undefined) this.notifier.stockChanged(book);
    return book;
  }

  /** Ajuste relativo de inventario (ej. +10 al recibir mercancía, -1 por daño). */
  async adjustStock(id: string, delta: number): Promise<Book> {
    const book =
      delta >= 0 ? await this.books.incrementStock({ bookId: id, quantity: delta }) : await this.books.decrementStock({ bookId: id, quantity: -delta });
    if (!book) {
      if (!(await this.books.findById(id))) throw AppError.notFound('Libro');
      throw AppError.badRequest('INSUFFICIENT_STOCK', 'El ajuste dejaría el stock en negativo');
    }
    this.notifier.stockChanged(book);
    return book;
  }

  async remove(id: string): Promise<void> {
    if (!(await this.books.delete(id))) throw AppError.notFound('Libro');
  }
}
