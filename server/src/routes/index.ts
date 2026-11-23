import { Router } from 'express';
import type { Container } from '../container';
import { authenticate, authorize } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimits';

/**
 * Tabla de rutas de la API. La autorización se declara junto a cada ruta
 * para que sea fácil de auditar.
 */
export function buildApiRouter(c: Container): Router {
  const router = Router();
  const auth = authenticate(c.tokens);
  const cliente = authorize('cliente');
  const admin = authorize('administrador');
  const { auth: authCtrl, books, orders, payments } = c.controllers;

  // Autenticación y usuarios
  router.post('/auth/register', authLimiter, authCtrl.register);
  router.post('/auth/login', authLimiter, authCtrl.login);
  router.get('/auth/me', auth, authCtrl.me);
  router.get('/users/me', auth, authCtrl.me);
  router.patch('/users/me', auth, authCtrl.updateMe);

  // Catálogo (lectura pública) y gestión de catálogo/stock (administrador)
  router.get('/books', books.list);
  router.get('/books/:id', books.get);
  router.post('/books', auth, admin, books.create);
  router.patch('/books/:id', auth, admin, books.update);
  router.post('/books/:id/stock', auth, admin, books.adjustStock);
  router.delete('/books/:id', auth, admin, books.remove);

  // Pedidos y envíos (rutas fijas antes de /:id)
  router.post('/orders', auth, cliente, orders.create);
  router.get('/orders/me', auth, cliente, orders.listMine);
  router.get('/orders/shipping', auth, admin, orders.listShipping);
  router.get('/orders/:id', auth, orders.get);
  router.patch('/orders/:id/status', auth, admin, orders.changeStatus);
  router.post('/orders/:id/cancel', auth, cliente, orders.cancel);

  // Pagos
  router.get('/payments/config', payments.config);
  router.post('/payments/paypal/order', auth, cliente, payments.createOrder);
  router.post('/payments/paypal/capture', auth, cliente, payments.capture);

  return router;
}
