import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser, Order, OrderItem, Payment } from '../../domain/entities';
import type { PaymentStatus } from '../../domain/orderStatus';
import type { OrderRepository } from '../../repositories/OrderRepository';
import type { PaymentRepository } from '../../repositories/PaymentRepository';
import { AppError } from '../../utils/AppError';
import type { InventoryService } from '../InventoryService';
import type { OrderNotifier } from '../OrderNotifier';
import type { CaptureResult, PaymentGateway } from './PaymentGateway';
import { PaymentService } from './PaymentService';

const owner: AuthUser = { id: 'u1', role: 'cliente', name: 'Ana' };
const stranger: AuthUser = { id: 'u2', role: 'cliente', name: 'Beto' };

const printed: OrderItem = { bookId: 'b1', title: { es: 'Cosmos', en: 'Cosmos' }, author: 'Sagan', format: 'impreso', unitPrice: 19.9, quantity: 1, subtotal: 19.9 };
const ebook: OrderItem = { bookId: 'b2', title: { es: '1984', en: '1984' }, author: 'Orwell', format: 'ebook', unitPrice: 5, quantity: 1, subtotal: 5 };

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    userId: 'u1',
    customerName: 'Ana',
    items: [printed, ebook],
    requiresShipping: true,
    shippingAddress: { recipient: 'Ana', line1: 'Calle 100', city: 'Medellín', phone: '3000000000' },
    shipment: {},
    notes: '',
    total: 24.9,
    currency: 'USD',
    status: 'PENDING_PAYMENT',
    paymentStatus: 'UNPAID',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Repositorios e inventario en memoria: prueban la lógica sin base de datos. */
function setup(captureResult: CaptureResult, options: { order?: Partial<Order>; stockOk?: boolean } = {}) {
  let order = makeOrder(options.order);
  const payments = new Map<string, Payment>();

  const orderRepo = {
    findById: vi.fn(async () => order),
    markPaid: vi.fn(async (_id: string, next: Order['status']) => {
      if (order.status !== 'PENDING_PAYMENT') return null;
      order = { ...order, status: next, paymentStatus: 'PAID' };
      return order;
    }),
  } as unknown as OrderRepository;

  const paymentRepo: PaymentRepository = {
    create: async (input) => {
      const p: Payment = { ...input, id: `p${payments.size + 1}`, status: 'CREATED' };
      payments.set(p.id, p);
      return p;
    },
    findByProviderOrderId: async (pid) => [...payments.values()].find((p) => p.providerOrderId === pid) ?? null,
    findReusableForOrder: async (oid, amount) =>
      [...payments.values()].find((p) => p.orderId === oid && p.amount === amount && p.status === 'CREATED') ?? null,
    transition: async (id, from: readonly PaymentStatus[], to, extra = {}) => {
      const p = payments.get(id);
      if (!p || !from.includes(p.status)) return null;
      const next = { ...p, ...extra, status: to };
      payments.set(id, next);
      return next;
    },
  };

  const inventory = {
    reserve: vi.fn(async () => {
      if (options.stockOk === false) throw AppError.conflict('OUT_OF_STOCK', 'sin stock');
    }),
    release: vi.fn(async () => undefined),
  } as unknown as InventoryService;

  const gateway: PaymentGateway = {
    name: 'fake',
    createOrder: vi.fn(async () => ({ providerOrderId: 'PP-1' })),
    captureOrder: vi.fn(async () => captureResult),
  };
  const notifier: OrderNotifier = { orderPaid: vi.fn(), orderStatusChanged: vi.fn(), stockChanged: vi.fn() };
  const service = new PaymentService(gateway, paymentRepo, orderRepo, inventory, notifier, 'public-id');
  return { service, gateway, notifier, payments, inventory };
}

const okCapture: CaptureResult = { completed: true, captureId: 'CAP-1', amount: 24.9, currency: 'USD', referenceId: 'o1', rawStatus: 'COMPLETED' };

describe('PaymentService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup(okCapture);
  });

  it('con libros impresos, el pedido pagado pasa a envíos (PENDING) y se notifica', async () => {
    await ctx.service.createProviderOrder(owner, 'o1');
    const order = await ctx.service.capture(owner, 'o1', 'PP-1');
    expect(order.status).toBe('PENDING');
    expect(order.paymentStatus).toBe('PAID');
    expect(ctx.inventory.reserve).toHaveBeenCalledTimes(1);
    expect(ctx.notifier.orderPaid).toHaveBeenCalledTimes(1);
  });

  it('un pedido solo de e-books queda entregado al pagarse', async () => {
    ctx = setup({ ...okCapture, amount: 5 }, { order: { items: [ebook], requiresShipping: false, shippingAddress: undefined, total: 5 } });
    await ctx.service.createProviderOrder(owner, 'o1');
    const order = await ctx.service.capture(owner, 'o1', 'PP-1');
    expect(order.status).toBe('DELIVERED');
  });

  it('reutiliza la orden del proveedor si se pide dos veces', async () => {
    await ctx.service.createProviderOrder(owner, 'o1');
    await ctx.service.createProviderOrder(owner, 'o1');
    expect(ctx.gateway.createOrder).toHaveBeenCalledTimes(1);
  });

  it('una captura repetida no cobra, no descuenta stock ni notifica dos veces', async () => {
    await ctx.service.createProviderOrder(owner, 'o1');
    await ctx.service.capture(owner, 'o1', 'PP-1');
    await ctx.service.capture(owner, 'o1', 'PP-1');
    expect(ctx.gateway.captureOrder).toHaveBeenCalledTimes(1);
    expect(ctx.inventory.reserve).toHaveBeenCalledTimes(1);
    expect(ctx.notifier.orderPaid).toHaveBeenCalledTimes(1);
  });

  it('otro usuario no puede pagar ni capturar un pedido ajeno', async () => {
    await expect(ctx.service.createProviderOrder(stranger, 'o1')).rejects.toMatchObject({ statusCode: 404 });
    await ctx.service.createProviderOrder(owner, 'o1');
    await expect(ctx.service.capture(stranger, 'o1', 'PP-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('sin stock no se cobra', async () => {
    ctx = setup(okCapture, { stockOk: false });
    await ctx.service.createProviderOrder(owner, 'o1');
    await expect(ctx.service.capture(owner, 'o1', 'PP-1')).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });
    expect(ctx.gateway.captureOrder).not.toHaveBeenCalled();
    expect([...ctx.payments.values()][0].status).toBe('FAILED');
  });

  it('rechaza una captura con importe distinto y devuelve el stock', async () => {
    ctx = setup({ ...okCapture, amount: 1 });
    await ctx.service.createProviderOrder(owner, 'o1');
    await expect(ctx.service.capture(owner, 'o1', 'PP-1')).rejects.toMatchObject({ code: 'PAYMENT_NOT_VERIFIED' });
    expect(ctx.notifier.orderPaid).not.toHaveBeenCalled();
    expect(ctx.inventory.release).toHaveBeenCalledTimes(1);
    expect([...ctx.payments.values()][0].status).toBe('FAILED');
  });

  it('no confirma si el proveedor no completó el pago', async () => {
    ctx = setup({ completed: false, rawStatus: 'DECLINED' });
    await ctx.service.createProviderOrder(owner, 'o1');
    await expect(ctx.service.capture(owner, 'o1', 'PP-1')).rejects.toMatchObject({ code: 'PAYMENT_NOT_VERIFIED' });
    expect(ctx.inventory.release).toHaveBeenCalledTimes(1);
  });
});
