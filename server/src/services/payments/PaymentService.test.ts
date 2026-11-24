import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser, Order, OrderItem, Payment } from '../../domain/entities';
import type { PaymentStatus } from '../../domain/orderStatus';
import type { OrderRepository } from '../../repositories/OrderRepository';
import type { PaymentRepository } from '../../repositories/PaymentRepository';
import { AppError } from '../../utils/AppError';
import type { InventoryService } from '../InventoryService';
import type { OrderNotifier } from '../OrderNotifier';
import { PaymentGatewayError, type CaptureResult, type PaymentGateway } from './PaymentGateway';
import { MAX_PAYMENT_ATTEMPTS, PaymentService, STALE_LOCK_MS } from './PaymentService';

const owner: AuthUser = { id: 'u1', role: 'cliente', name: 'Ana' };
const stranger: AuthUser = { id: 'u2', role: 'cliente', name: 'Beto' };

const printed: OrderItem = { bookId: 'b1', title: { es: 'Cosmos', en: 'Cosmos' }, author: 'Sagan', format: 'impreso', unitPrice: 19.9, quantity: 1, subtotal: 19.9, downloads: 0 };
const ebook: OrderItem = { bookId: 'b2', title: { es: '1984', en: '1984' }, author: 'Orwell', format: 'ebook', unitPrice: 5, quantity: 1, subtotal: 5, downloads: 0 };

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
    stockReserved: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const okCapture: CaptureResult = { state: 'COMPLETED', captureId: 'CAP-1', amount: 24.9, currency: 'USD', referenceId: 'o1', rawStatus: 'COMPLETED' };

/**
 * Repositorios, inventario y pasarela en memoria. El repositorio de pedidos
 * reproduce las condiciones atómicas de Mongo (candado UNPAID → PROCESSING).
 */
function setup(options: { order?: Partial<Order>; stockOk?: boolean; capture?: () => Promise<CaptureResult> } = {}) {
  let order = makeOrder(options.order);
  const payments = new Map<string, Payment>();
  let ids = 0;

  const orderRepo = {
    findById: vi.fn(async () => order),
    claimForPayment: vi.fn(async (_id: string, paymentId: string) => {
      if (order.status !== 'PENDING_PAYMENT' || order.paymentStatus !== 'UNPAID') return null;
      order = { ...order, paymentStatus: 'PROCESSING', activePaymentId: paymentId, paymentLockedAt: new Date() };
      return order;
    }),
    releasePaymentClaim: vi.fn(async () => {
      if (order.paymentStatus !== 'PROCESSING') return null;
      order = { ...order, paymentStatus: 'UNPAID', activePaymentId: undefined, paymentLockedAt: undefined };
      return order;
    }),
    touchPaymentClaim: vi.fn(async () => {
      order = { ...order, paymentLockedAt: new Date() };
    }),
    setStockReserved: vi.fn(async (_id: string, reserved: boolean) => {
      order = { ...order, stockReserved: reserved };
    }),
    markPaid: vi.fn(async (_id: string, next: Order['status']) => {
      if (order.status !== 'PENDING_PAYMENT' || order.paymentStatus !== 'PROCESSING') return null;
      order = { ...order, status: next, paymentStatus: 'PAID', paymentLockedAt: undefined };
      return order;
    }),
    cancelUnpaid: vi.fn(async () => {
      if (order.status !== 'PENDING_PAYMENT' || order.paymentStatus !== 'UNPAID') return null;
      order = { ...order, status: 'CANCELLED' };
      return order;
    }),
    findStaleProcessing: vi.fn(async (before: Date) =>
      order.paymentStatus === 'PROCESSING' && order.paymentLockedAt && order.paymentLockedAt < before ? [order] : [],
    ),
  };

  const paymentRepo: PaymentRepository = {
    create: async (input) => {
      const p: Payment = { ...input, id: `p${++ids}`, status: 'CREATED', updatedAt: new Date() };
      payments.set(p.id, p);
      return p;
    },
    findById: async (id) => payments.get(id) ?? null,
    findByProviderOrderId: async (pid) => [...payments.values()].find((p) => p.providerOrderId === pid) ?? null,
    findReusableForOrder: async (oid, amount) =>
      [...payments.values()].find((p) => p.orderId === oid && p.amount === amount && p.status === 'CREATED') ?? null,
    countForOrder: async (oid) => [...payments.values()].filter((p) => p.orderId === oid).length,
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

  let providerSeq = 0;
  const gateway = {
    name: 'fake',
    createOrder: vi.fn(async () => ({ providerOrderId: `PP-${++providerSeq}` })),
    captureOrder: vi.fn(options.capture ?? (async () => okCapture)),
    getCaptureStatus: vi.fn(async () => okCapture),
    refund: vi.fn(async () => undefined),
  } satisfies PaymentGateway;

  const notifier: OrderNotifier = { orderPaid: vi.fn(), orderStatusChanged: vi.fn(), stockChanged: vi.fn() };
  const service = new PaymentService(gateway, paymentRepo, orderRepo as unknown as OrderRepository, inventory, notifier, 'public-id');
  const later = () => new Date(Date.now() + STALE_LOCK_MS + 1000);
  return { service, gateway, notifier, payments, inventory, orderRepo, current: () => order, later };
}

const paymentStatuses = (ctx: ReturnType<typeof setup>) => [...ctx.payments.values()].map((p) => p.status);

describe('PaymentService', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
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
    ctx = setup({ order: { items: [ebook], requiresShipping: false, shippingAddress: undefined, total: 5 }, capture: async () => ({ ...okCapture, amount: 5 }) });
    await ctx.service.createProviderOrder(owner, 'o1');
    expect((await ctx.service.capture(owner, 'o1', 'PP-1')).status).toBe('DELIVERED');
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

  it('sin stock no se cobra y el pedido queda libre para reintentar', async () => {
    ctx = setup({ stockOk: false });
    await ctx.service.createProviderOrder(owner, 'o1');
    await expect(ctx.service.capture(owner, 'o1', 'PP-1')).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });
    expect(ctx.gateway.captureOrder).not.toHaveBeenCalled();
    expect(paymentStatuses(ctx)).toEqual(['FAILED']);
    expect(ctx.current().paymentStatus).toBe('UNPAID');
  });

  it('si el proveedor rechaza el pago, devuelve el stock y no confirma', async () => {
    ctx = setup({ capture: async () => ({ state: 'FAILED', rawStatus: 'DECLINED' }) });
    await ctx.service.createProviderOrder(owner, 'o1');
    await expect(ctx.service.capture(owner, 'o1', 'PP-1')).rejects.toMatchObject({ code: 'PAYMENT_NOT_VERIFIED' });
    expect(ctx.inventory.release).toHaveBeenCalledTimes(1);
    expect(ctx.current()).toMatchObject({ paymentStatus: 'UNPAID', stockReserved: false });
  });

  it('un cobro con importe distinto se REEMBOLSA, devuelve el stock y no confirma', async () => {
    ctx = setup({ capture: async () => ({ ...okCapture, amount: 1 }) });
    await ctx.service.createProviderOrder(owner, 'o1');
    await expect(ctx.service.capture(owner, 'o1', 'PP-1')).rejects.toMatchObject({ code: 'PAYMENT_NOT_VERIFIED' });
    expect(ctx.gateway.refund).toHaveBeenCalledWith('CAP-1', 1, 'USD');
    expect(paymentStatuses(ctx)).toEqual(['REFUNDED']);
    expect(ctx.inventory.release).toHaveBeenCalledTimes(1);
    expect(ctx.notifier.orderPaid).not.toHaveBeenCalled();
  });

  describe('H1 · candado a nivel de pedido', () => {
    it('no se puede cancelar mientras se captura; el pago termina confirmado', async () => {
      let resolveCapture!: (r: CaptureResult) => void;
      ctx = setup({ capture: () => new Promise((r) => (resolveCapture = r)) });
      await ctx.service.createProviderOrder(owner, 'o1');

      const capturing = ctx.service.capture(owner, 'o1', 'PP-1');
      await vi.waitFor(() => expect(ctx.gateway.captureOrder).toHaveBeenCalled());
      // Cancelación concurrente: el repositorio la rechaza porque el pedido está PROCESSING.
      expect(await ctx.orderRepo.cancelUnpaid()).toBeNull();

      resolveCapture(okCapture);
      const paid = await capturing;
      expect(paid).toMatchObject({ paymentStatus: 'PAID', status: 'PENDING' });
    });

    it('dos intentos de pago del mismo pedido capturados a la vez: solo se cobra uno', async () => {
      let resolveCapture!: (r: CaptureResult) => void;
      ctx = setup({ capture: () => new Promise((r) => (resolveCapture = r)) });
      // Dos órdenes en el proveedor (p. ej. dos pestañas o un intento fallido previo).
      await ctx.service.createProviderOrder(owner, 'o1');
      const first = [...ctx.payments.values()][0];
      await ctx.payments.set(first.id, { ...first, status: 'FAILED' });
      await ctx.service.createProviderOrder(owner, 'o1');

      const a = ctx.service.capture(owner, 'o1', 'PP-1');
      await vi.waitFor(() => expect(ctx.gateway.captureOrder).toHaveBeenCalledTimes(1));
      await expect(ctx.service.capture(owner, 'o1', 'PP-2')).rejects.toMatchObject({ code: 'PAYMENT_IN_PROGRESS' });

      resolveCapture(okCapture);
      await a;
      expect(ctx.gateway.captureOrder).toHaveBeenCalledTimes(1);
      expect(ctx.inventory.reserve).toHaveBeenCalledTimes(1);
      // Y con el pedido ya pagado, el segundo intento ya no es capturable.
      await expect(ctx.service.capture(owner, 'o1', 'PP-2')).rejects.toMatchObject({ code: 'ORDER_NOT_PAYABLE' });
    });

    it('limita los intentos de pago por pedido', async () => {
      for (let i = 0; i < MAX_PAYMENT_ATTEMPTS; i++) {
        await ctx.service.createProviderOrder(owner, 'o1');
        const last = [...ctx.payments.values()].at(-1)!;
        ctx.payments.set(last.id, { ...last, status: 'FAILED' });
      }
      await expect(ctx.service.createProviderOrder(owner, 'o1')).rejects.toMatchObject({ code: 'TOO_MANY_PAYMENT_ATTEMPTS' });
    });
  });

  describe('M4 · conciliación', () => {
    it('una captura en revisión (PENDING) conserva stock y candado, y se confirma al conciliar', async () => {
      ctx = setup({ capture: async () => ({ state: 'PENDING', rawStatus: 'PENDING' }) });
      await ctx.service.createProviderOrder(owner, 'o1');
      const order = await ctx.service.capture(owner, 'o1', 'PP-1');
      expect(order).toMatchObject({ paymentStatus: 'PROCESSING', stockReserved: true });
      expect(ctx.inventory.release).not.toHaveBeenCalled();
      await expect(ctx.service.capture(owner, 'o1', 'PP-1')).rejects.toMatchObject({ code: 'PAYMENT_IN_PROGRESS' });

      expect(await ctx.service.reconcile(ctx.later())).toBe(1);
      expect(ctx.current()).toMatchObject({ paymentStatus: 'PAID', status: 'PENDING' });
      expect(ctx.inventory.reserve).toHaveBeenCalledTimes(1); // no se descontó dos veces
      expect(ctx.notifier.orderPaid).toHaveBeenCalledTimes(1);
    });

    it('un error de red al capturar no libera el stock; la conciliación reintenta y confirma', async () => {
      let calls = 0;
      ctx = setup({
        capture: async () => {
          calls += 1;
          if (calls === 1) throw new PaymentGatewayError('timeout', true);
          return okCapture;
        },
      });
      await ctx.service.createProviderOrder(owner, 'o1');
      await expect(ctx.service.capture(owner, 'o1', 'PP-1')).rejects.toMatchObject({ code: 'PAYMENT_PENDING_CONFIRMATION' });
      expect(ctx.current()).toMatchObject({ paymentStatus: 'PROCESSING', stockReserved: true });

      await ctx.service.reconcile(ctx.later());
      expect(ctx.current().paymentStatus).toBe('PAID');
      expect(ctx.inventory.reserve).toHaveBeenCalledTimes(1);
    });

    it('si la BD falla después de cobrar, la conciliación marca el pedido como pagado', async () => {
      await ctx.service.createProviderOrder(owner, 'o1');
      ctx.orderRepo.markPaid.mockRejectedValueOnce(new Error('BD caída'));
      await expect(ctx.service.capture(owner, 'o1', 'PP-1')).rejects.toThrow('BD caída');
      expect(paymentStatuses(ctx)).toEqual(['CAPTURED']);
      expect(ctx.current().paymentStatus).toBe('PROCESSING');

      await ctx.service.reconcile(ctx.later());
      expect(ctx.current().paymentStatus).toBe('PAID');
      expect(ctx.gateway.refund).not.toHaveBeenCalled();
    });

    it('un candado reciente no se toca (podría haber una captura en curso)', async () => {
      ctx = setup({ capture: async () => ({ state: 'PENDING', rawStatus: 'PENDING' }) });
      await ctx.service.createProviderOrder(owner, 'o1');
      await ctx.service.capture(owner, 'o1', 'PP-1');
      expect(await ctx.service.reconcile(new Date())).toBe(0);
      expect(ctx.gateway.getCaptureStatus).not.toHaveBeenCalled();
    });

    it('si el proveedor finalmente rechaza un pago en revisión, se devuelve el stock', async () => {
      ctx = setup({ capture: async () => ({ state: 'PENDING', rawStatus: 'PENDING' }) });
      ctx.gateway.getCaptureStatus.mockResolvedValue({ state: 'FAILED', rawStatus: 'DECLINED' });
      await ctx.service.createProviderOrder(owner, 'o1');
      await ctx.service.capture(owner, 'o1', 'PP-1');
      await ctx.service.reconcile(ctx.later());
      expect(ctx.current()).toMatchObject({ paymentStatus: 'UNPAID', stockReserved: false });
      expect(paymentStatuses(ctx)).toEqual(['FAILED']);
    });
  });
});
