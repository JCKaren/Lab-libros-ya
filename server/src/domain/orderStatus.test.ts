import { describe, expect, it } from 'vitest';
import { allowedTransitions, canTransition, statusAfterPayment } from './orderStatus';

describe('máquina de estados del pedido', () => {
  it('el administrador avanza el envío un paso a la vez', () => {
    expect(canTransition('PENDING', 'PREPARING', 'administrador')).toBe(true);
    expect(canTransition('PREPARING', 'SHIPPED', 'administrador')).toBe(true);
    expect(canTransition('SHIPPED', 'DELIVERED', 'administrador')).toBe(true);
  });

  it('no permite saltar de Pendiente a Entregado', () => {
    expect(canTransition('PENDING', 'DELIVERED', 'administrador')).toBe(false);
    expect(canTransition('PENDING', 'SHIPPED', 'administrador')).toBe(false);
  });

  it('solo el sistema confirma el pago', () => {
    expect(canTransition('PENDING_PAYMENT', 'PENDING', 'administrador')).toBe(false);
    expect(canTransition('PENDING_PAYMENT', 'PENDING', 'cliente')).toBe(false);
    expect(canTransition('PENDING_PAYMENT', 'PENDING', 'system')).toBe(true);
  });

  it('el cliente no cambia estados de envío', () => {
    expect(allowedTransitions('PENDING', 'cliente')).toEqual([]);
  });

  it('un pedido entregado es final', () => {
    expect(allowedTransitions('DELIVERED', 'administrador')).toEqual([]);
  });

  it('un pedido solo de e-books se entrega al pagarse; con impresos va a envíos', () => {
    expect(statusAfterPayment(false)).toBe('DELIVERED');
    expect(statusAfterPayment(true)).toBe('PENDING');
    expect(canTransition('PENDING_PAYMENT', statusAfterPayment(false), 'system')).toBe(true);
  });
});
