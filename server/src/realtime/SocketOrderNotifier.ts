import type { Server } from 'socket.io';
import type { Book, Order } from '../domain/entities';
import { adminOrderView, customerOrderView } from '../presenters/views';
import type { OrderNotifier } from '../services/OrderNotifier';
import { ROOMS, SOCKET_EVENTS } from './events';

/** Implementación del Observer sobre Socket.IO. Cada sala recibe solo lo que necesita. */
export class SocketOrderNotifier implements OrderNotifier {
  constructor(private readonly io: Server) {}

  orderPaid(order: Order): void {
    // Solo los pedidos con envío físico entran al tablero de envíos.
    if (order.requiresShipping) this.io.to(ROOMS.admins).emit(SOCKET_EVENTS.orderCreated, adminOrderView(order));
    this.io.to(ROOMS.user(order.userId)).emit(SOCKET_EVENTS.orderUpdated, customerOrderView(order));
  }

  orderStatusChanged(order: Order): void {
    if (order.requiresShipping) this.io.to(ROOMS.admins).emit(SOCKET_EVENTS.orderStatusChanged, adminOrderView(order));
    this.io.to(ROOMS.user(order.userId)).emit(SOCKET_EVENTS.orderUpdated, customerOrderView(order));
  }

  stockChanged(book: Book): void {
    this.io.to(ROOMS.admins).emit(SOCKET_EVENTS.stockChanged, { id: book.id, stock: book.stock });
  }
}
