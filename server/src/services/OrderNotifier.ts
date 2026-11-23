import type { Book, Order } from '../domain/entities';

/**
 * Patrón Observer: los servicios publican eventos de dominio sin conocer
 * el transporte (Socket.IO, colas, correo...). Permite cambiarlo o añadir otros.
 */
export interface OrderNotifier {
  orderPaid(order: Order): void;
  orderStatusChanged(order: Order): void;
  stockChanged(book: Book): void;
}

export class NullOrderNotifier implements OrderNotifier {
  orderPaid(): void {}
  orderStatusChanged(): void {}
  stockChanged(): void {}
}
