import type { OrderItem } from '../domain/entities';
import type { BookRepository } from '../repositories/BookRepository';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import type { OrderNotifier } from './OrderNotifier';

/**
 * Responsable único del inventario durante la venta.
 * Reserva todo el pedido o nada: si un libro no alcanza, devuelve lo ya descontado.
 */
export class InventoryService {
  constructor(
    private readonly books: BookRepository,
    private readonly notifier: OrderNotifier,
  ) {}

  async reserve(items: OrderItem[]): Promise<void> {
    const reserved: OrderItem[] = [];
    for (const item of items) {
      const book = await this.books.decrementStock({ bookId: item.bookId, quantity: item.quantity });
      if (!book) {
        await this.release(reserved);
        throw AppError.conflict('OUT_OF_STOCK', 'Uno de los libros ya no tiene stock suficiente');
      }
      reserved.push(item);
      this.notifier.stockChanged(book);
    }
  }

  async release(items: OrderItem[]): Promise<void> {
    for (const item of items) {
      try {
        const book = await this.books.incrementStock({ bookId: item.bookId, quantity: item.quantity });
        if (book) this.notifier.stockChanged(book);
      } catch (err) {
        logger.error(`No se pudo devolver stock del libro ${item.bookId}`, (err as Error).message);
      }
    }
  }
}
