import type { Server } from 'socket.io';
import { env } from './config/env';
import { AuthController } from './controllers/AuthController';
import { BookController } from './controllers/BookController';
import { OrderController } from './controllers/OrderController';
import { PaymentController } from './controllers/PaymentController';
import type { Book, Order } from './domain/entities';
import { SocketOrderNotifier } from './realtime/SocketOrderNotifier';
import { MongoBookRepository } from './repositories/BookRepository';
import { MongoOrderRepository } from './repositories/OrderRepository';
import { MongoPaymentRepository } from './repositories/PaymentRepository';
import { MongoUserRepository } from './repositories/UserRepository';
import { AuthService } from './services/AuthService';
import { BookService } from './services/BookService';
import { InventoryService } from './services/InventoryService';
import { NullOrderNotifier, type OrderNotifier } from './services/OrderNotifier';
import { OrderService } from './services/OrderService';
import { BcryptPasswordHasher } from './services/PasswordHasher';
import { JwtTokenService, type TokenService } from './services/TokenService';
import { MockGateway } from './services/payments/MockGateway';
import type { PaymentGateway } from './services/payments/PaymentGateway';
import { PaymentService } from './services/payments/PaymentService';
import { PaypalGateway } from './services/payments/PaypalGateway';

/**
 * Composition root (inyección de dependencias manual): el único lugar
 * que conoce las implementaciones concretas. El resto depende de interfaces (DIP).
 */
export interface Container {
  tokens: TokenService;
  controllers: {
    auth: AuthController;
    books: BookController;
    orders: OrderController;
    payments: PaymentController;
  };
  /** Se conecta cuando el servidor de sockets ya existe. */
  attachRealtime(io: Server): void;
}

/** Strategy: la pasarela concreta se elige por configuración. */
function createPaymentGateway(): PaymentGateway {
  return env.PAYMENT_PROVIDER === 'mock'
    ? new MockGateway()
    : new PaypalGateway(env.PAYPAL_CLIENT_ID, env.PAYPAL_CLIENT_SECRET, env.PAYPAL_API_BASE);
}

/** Proxy que delega en el notificador real una vez que Socket.IO está listo. */
class DeferredNotifier implements OrderNotifier {
  target: OrderNotifier = new NullOrderNotifier();
  orderPaid(order: Order) {
    this.target.orderPaid(order);
  }
  orderStatusChanged(order: Order) {
    this.target.orderStatusChanged(order);
  }
  stockChanged(book: Book) {
    this.target.stockChanged(book);
  }
}

export function createContainer(): Container {
  const tokens = new JwtTokenService(env.JWT_SECRET, env.JWT_EXPIRES_IN);
  const notifier = new DeferredNotifier();

  const users = new MongoUserRepository();
  const books = new MongoBookRepository();
  const orders = new MongoOrderRepository();
  const payments = new MongoPaymentRepository();

  const authService = new AuthService(users, new BcryptPasswordHasher(), tokens);
  const bookService = new BookService(books, notifier);
  const inventory = new InventoryService(books, notifier);
  const orderService = new OrderService(orders, books, notifier, env.CURRENCY);
  const paymentService = new PaymentService(createPaymentGateway(), payments, orders, inventory, notifier, env.PAYPAL_CLIENT_ID);

  return {
    tokens,
    controllers: {
      auth: new AuthController(authService),
      books: new BookController(bookService, tokens),
      orders: new OrderController(orderService),
      payments: new PaymentController(paymentService, env.CURRENCY),
    },
    attachRealtime(io) {
      notifier.target = new SocketOrderNotifier(io);
    },
  };
}
