/**
 * Pruebas de integración de seguridad: API real (Express + Socket.IO) sobre un
 * MongoDB en memoria. Cubren la matriz de autorización, sesiones revocables,
 * WebSockets, CORS, límites, validación de URLs y descargas firmadas.
 */
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { io as connectSocket, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ORIGIN = 'https://web.librosya.test';
const PASSWORD = 'ClaveSegura2026';

let mongo: MongoMemoryServer;
let http: HttpServer;
let baseUrl = '';
let models: typeof import('../models/User') & typeof import('../models/Book') & typeof import('../models/Order');
let disconnect: () => Promise<void>;
let ipSeq = 0;

/** Cada petición sale de una IP distinta salvo que se fije: aísla los límites de tasa entre pruebas. */
const api = (ip = `10.0.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`) => {
  const agent = request(baseUrl);
  const withIp = <T extends { set: (k: string, v: string) => T }>(r: T) => r.set('X-Forwarded-For', ip);
  return {
    get: (p: string) => withIp(agent.get(p)),
    post: (p: string) => withIp(agent.post(p)),
    patch: (p: string) => withIp(agent.patch(p)),
    delete: (p: string) => withIp(agent.delete(p)),
    options: (p: string) => withIp(agent.options(p)),
  };
};

async function createUser(email: string, role: 'cliente' | 'administrador') {
  const { BcryptPasswordHasher } = await import('../services/PasswordHasher');
  const passwordHash = await new BcryptPasswordHasher().hash(PASSWORD);
  return models.UserModel.create({ name: role === 'cliente' ? 'Cliente Test' : 'Admin Test', email, role, passwordHash });
}

async function login(email: string): Promise<string> {
  const res = await api().post('/api/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

let clientToken = '';
let otherToken = '';
let adminToken = '';
let ebookId = '';
let printedId = '';

/** Crea y paga (pasarela simulada) un pedido de un e-book; devuelve el id. */
async function buyEbook(token: string): Promise<string> {
  const created = await api().post('/api/orders').set(bearer(token)).send({ items: [{ bookId: ebookId, quantity: 1 }] });
  expect(created.status).toBe(201);
  const orderId = created.body.order.id as string;
  const pp = await api().post('/api/payments/paypal/order').set(bearer(token)).send({ orderId });
  const paid = await api().post('/api/payments/paypal/capture').set(bearer(token)).send({ orderId, providerOrderId: pp.body.providerOrderId });
  expect(paid.status).toBe(200);
  return orderId;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri('librosya_test'),
    JWT_SECRET: 'x'.repeat(48),
    JWT_EXPIRES_IN: '1h',
    CLIENT_ORIGIN: ORIGIN,
    PAYMENT_PROVIDER: 'mock',
    AUTH_RATE_LIMIT: '5',
    REGISTER_RATE_LIMIT: '50',
    TRUST_PROXY: '1',
  });

  const db = await import('../config/db');
  const { env } = await import('../config/env');
  const { createApp } = await import('../app');
  const { createContainer } = await import('../container');
  const { createSocketServer } = await import('../realtime/socketServer');
  models = { ...(await import('../models/User')), ...(await import('../models/Book')), ...(await import('../models/Order')) };

  await db.connectDatabase();
  await Promise.all([models.UserModel.init(), models.BookModel.init(), models.OrderModel.init()]);
  disconnect = db.disconnectDatabase;

  const container = createContainer();
  http = createServer(createApp(container, env.clientOrigins, env.trustProxy));
  container.attachRealtime(createSocketServer(http, container.sessions, env.clientOrigins, 200));
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;

  await createUser('cliente@test.com', 'cliente');
  await createUser('otro@test.com', 'cliente');
  await createUser('admin@test.com', 'administrador');
  clientToken = await login('cliente@test.com');
  otherToken = await login('otro@test.com');
  adminToken = await login('admin@test.com');

  const base = { description: { es: 'd', en: 'd' }, category: 'ficcion', isbn: '', coverUrl: '', active: true };
  ebookId = (await models.BookModel.create({ ...base, title: { es: 'E', en: 'E' }, author: 'A', format: 'ebook', price: 5, stock: 100, downloadUrl: 'https://www.gutenberg.org/ebooks/1342' })).id;
  printedId = (await models.BookModel.create({ ...base, title: { es: 'P', en: 'P' }, author: 'B', format: 'impreso', price: 10, stock: 50, downloadUrl: '' })).id;
}, 120_000);

afterAll(async () => {
  await new Promise((resolve) => http?.close(resolve));
  await disconnect?.();
  await mongo?.stop();
});

describe('Matriz de autorización (rol × endpoint)', () => {
  const cases: Array<[string, string, string, { anon: number; cliente: number; admin: number }]> = [
    ['GET', '/api/books', '', { anon: 200, cliente: 200, admin: 200 }],
    ['POST', '/api/books', 'book', { anon: 401, cliente: 403, admin: 400 }],
    ['GET', '/api/orders/me', '', { anon: 401, cliente: 200, admin: 403 }],
    ['GET', '/api/orders/shipping', '', { anon: 401, cliente: 403, admin: 200 }],
    ['POST', '/api/orders', 'order', { anon: 401, cliente: 400, admin: 403 }],
    ['PATCH', '/api/orders/000000000000000000000000/status', 'status', { anon: 401, cliente: 403, admin: 404 }],
    ['POST', '/api/payments/paypal/order', 'pay', { anon: 401, cliente: 404, admin: 403 }],
    ['POST', '/api/orders/000000000000000000000000/downloads/000000000000000000000000', '', { anon: 401, cliente: 404, admin: 403 }],
  ];
  const bodies: Record<string, object> = {
    book: {},
    order: { items: [] },
    status: { status: 'PREPARING' },
    pay: { orderId: '000000000000000000000000' },
  };

  it.each(cases)('%s %s', async (method, path, body, expected) => {
    for (const [who, token] of [['anon', ''], ['cliente', clientToken], ['admin', adminToken]] as const) {
      const client = api();
      let req = method === 'GET' ? client.get(path) : method === 'PATCH' ? client.patch(path) : client.post(path);
      if (token) req = req.set(bearer(token));
      const res = await (body ? req.send(bodies[body]) : req);
      expect({ who, status: res.status }).toEqual({ who, status: expected[who] });
    }
  });
});

describe('M1 · sesiones revocables', () => {
  it('un administrador degradado pierde el acceso con su token anterior', async () => {
    await createUser('degradado@test.com', 'administrador');
    const token = await login('degradado@test.com');
    expect((await api().get('/api/orders/shipping').set(bearer(token))).status).toBe(200);
    await models.UserModel.updateOne({ email: 'degradado@test.com' }, { role: 'cliente' });
    expect((await api().get('/api/orders/shipping').set(bearer(token))).status).toBe(403);
  });

  it('una cuenta borrada no puede usar su token', async () => {
    await createUser('borrado@test.com', 'cliente');
    const token = await login('borrado@test.com');
    await models.UserModel.deleteOne({ email: 'borrado@test.com' });
    expect((await api().get('/api/auth/me').set(bearer(token))).status).toBe(401);
  });

  it('cerrar sesión invalida el token en el servidor', async () => {
    await createUser('salir@test.com', 'cliente');
    const token = await login('salir@test.com');
    expect((await api().post('/api/auth/logout').set(bearer(token))).status).toBe(204);
    expect((await api().get('/api/auth/me').set(bearer(token))).status).toBe(401);
  });
});

describe('WebSockets', () => {
  const open = (token?: string) =>
    new Promise<Socket>((resolve, reject) => {
      const s = connectSocket(baseUrl, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false, forceNew: true });
      s.on('connect', () => resolve(s));
      s.on('connect_error', (err) => {
        s.close();
        reject(err);
      });
    });

  it('rechaza conexiones sin token o con token falso', async () => {
    await expect(open()).rejects.toThrow('UNAUTHORIZED');
    await expect(open('token.falso')).rejects.toThrow('UNAUTHORIZED');
  });

  it('un cliente no recibe eventos de la sala de administradores', async () => {
    const admin = await open(adminToken);
    const client = await open(clientToken);
    const got = { admin: 0, client: 0 };
    admin.on('book:stockChanged', () => (got.admin += 1));
    client.on('book:stockChanged', () => (got.client += 1));
    await api().post(`/api/books/${printedId}/stock`).set(bearer(adminToken)).send({ delta: 1 });
    await new Promise((r) => setTimeout(r, 300));
    expect(got).toEqual({ admin: 1, client: 0 });
    admin.close();
    client.close();
  });

  it('desconecta al administrador cuando se le quita el rol', async () => {
    await createUser('socketadmin@test.com', 'administrador');
    const token = await login('socketadmin@test.com');
    const socket = await open(token);
    const closed = new Promise<void>((resolve) => socket.on('disconnect', () => resolve()));
    await models.UserModel.updateOne({ email: 'socketadmin@test.com' }, { role: 'cliente' });
    await closed; // revalidación cada 200 ms en esta prueba
    expect(socket.connected).toBe(false);
  });
});

describe('CORS, límites y errores', () => {
  it('solo el origen permitido recibe Access-Control-Allow-Origin', async () => {
    const ok = await api().options('/api/books').set('Origin', ORIGIN).set('Access-Control-Request-Method', 'GET');
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);
    const evil = await api().options('/api/books').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('el intento de login que supera el límite recibe 429', async () => {
    const client = api('203.0.113.7');
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await client.post('/api/auth/login').send({ email: 'x@test.com', password: 'nope' })).status);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it('dos registros simultáneos con el mismo correo: uno 201 y otro 409 (nunca 500)', async () => {
    const body = { name: 'Doble', email: 'doble@test.com', password: PASSWORD };
    const [a, b] = await Promise.all([api().post('/api/auth/register').send(body), api().post('/api/auth/register').send(body)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it('rechaza contraseñas débiles o que contienen el correo', async () => {
    for (const password of ['12345678', 'soloLetrasLargas', 'pepito2026x']) {
      const res = await api().post('/api/auth/register').send({ name: 'Débil', email: 'pepito2026@test.com', password });
      expect(res.status).toBe(400);
    }
  });

  it('un cuerpo demasiado grande responde 413', async () => {
    const res = await api().post('/api/auth/login').set('Content-Type', 'application/json').send(JSON.stringify({ email: 'a'.repeat(200_000) }));
    expect(res.status).toBe(413);
  });
});

describe('M3 · URLs del catálogo', () => {
  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'http://inseguro.example/libro.pdf'])('rechaza %s', async (url) => {
    const res = await api().patch(`/api/books/${ebookId}`).set(bearer(adminToken)).send({ downloadUrl: url });
    expect(res.status).toBe(400);
  });
});

describe('M5 · descargas firmadas', () => {
  it('el pedido no expone la URL permanente; el enlace firmado redirige y cuenta descargas', async () => {
    const orderId = await buyEbook(clientToken);
    const view = await api().get(`/api/orders/${orderId}`).set(bearer(clientToken));
    expect(JSON.stringify(view.body)).not.toContain('gutenberg');
    expect(view.body.order.items[0]).toMatchObject({ downloadable: true, downloadsLeft: 5 });
    for (const field of ['userId', 'activePaymentId', 'paymentLockedAt', 'stockReserved']) expect(view.body.order).not.toHaveProperty(field);

    const issued = await api().post(`/api/orders/${orderId}/downloads/${ebookId}`).set(bearer(clientToken));
    expect(issued.status).toBe(201);
    expect(issued.body.downloadsLeft).toBe(4);
    const redirect = await api().get(issued.body.path);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.location).toBe('https://www.gutenberg.org/ebooks/1342');
    expect(redirect.headers['cache-control']).toBe('no-store');

    // El token de descarga no sirve como sesión.
    const token = (issued.body.path as string).split('/').pop()!;
    expect((await api().get('/api/auth/me').set(bearer(token))).status).toBe(401);
    // Y un token de sesión no sirve como enlace de descarga.
    expect((await api().get(`/api/downloads/${clientToken}`)).status).toBe(410);
  });

  it('otro usuario no puede emitir enlaces de un pedido ajeno', async () => {
    const orderId = await buyEbook(clientToken);
    expect((await api().post(`/api/orders/${orderId}/downloads/${ebookId}`).set(bearer(otherToken))).status).toBe(404);
  });

  it('respeta el límite de descargas por libro', async () => {
    const orderId = await buyEbook(clientToken);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await api().post(`/api/orders/${orderId}/downloads/${ebookId}`).set(bearer(clientToken))).status);
    expect(statuses).toEqual([201, 201, 201, 201, 201, 409]);
  });

  it('un pedido sin pagar no permite descargas', async () => {
    const created = await api().post('/api/orders').set(bearer(otherToken)).send({ items: [{ bookId: ebookId, quantity: 1 }] });
    const res = await api().post(`/api/orders/${created.body.order.id}/downloads/${ebookId}`).set(bearer(otherToken));
    expect(res.status).toBe(409);
    await api().post(`/api/orders/${created.body.order.id}/cancel`).set(bearer(otherToken));
  });
});

describe('H1/L5 · pedidos y cobro', () => {
  it('no se puede cancelar un pedido con un cobro en curso', async () => {
    const created = await api().post('/api/orders').set(bearer(otherToken)).send({ items: [{ bookId: ebookId, quantity: 1 }] });
    const orderId = created.body.order.id as string;
    await models.OrderModel.updateOne({ _id: orderId }, { paymentStatus: 'PROCESSING', paymentLockedAt: new Date() });
    const res = await api().post(`/api/orders/${orderId}/cancel`).set(bearer(otherToken));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PAYMENT_IN_PROGRESS');
    await models.OrderModel.updateOne({ _id: orderId }, { paymentStatus: 'UNPAID', status: 'CANCELLED' });
  });

  it('limita los pedidos sin pagar por cliente', async () => {
    await createUser('muchos@test.com', 'cliente');
    const token = await login('muchos@test.com');
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await api().post('/api/orders').set(bearer(token)).send({ items: [{ bookId: ebookId, quantity: 1 }] })).status);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 409]);
  });

  it('la vista de administración no expone ids de usuario ni datos internos', async () => {
    const created = await api()
      .post('/api/orders')
      .set(bearer(clientToken))
      .send({ items: [{ bookId: printedId, quantity: 1 }], shippingAddress: { recipient: 'Ana', line1: 'Calle 1 #2-3', city: 'Medellín', phone: '+57 3001234567' } });
    const orderId = created.body.order.id as string;
    const pp = await api().post('/api/payments/paypal/order').set(bearer(clientToken)).send({ orderId });
    await api().post('/api/payments/paypal/capture').set(bearer(clientToken)).send({ orderId, providerOrderId: pp.body.providerOrderId });
    const board = await api().get('/api/orders/shipping').set(bearer(adminToken));
    const order = board.body.orders.find((o: { id: string }) => o.id === orderId);
    expect(order).toBeDefined();
    for (const field of ['userId', 'activePaymentId', 'paymentLockedAt', 'stockReserved']) expect(order).not.toHaveProperty(field);
  });
});
