import { describe, expect, it } from 'vitest';
import { PricingError, priceOrder, type CatalogBook } from './pricing';

const book = (overrides: Partial<CatalogBook> & Pick<CatalogBook, 'id'>): CatalogBook => ({
  title: { es: 'Libro', en: 'Book' },
  author: 'Autor',
  format: 'impreso',
  price: 10,
  stock: 10,
  active: true,
  downloadUrl: '',
  ...overrides,
});

const catalog = [
  book({ id: 'a', price: 9.99, format: 'ebook', downloadUrl: 'https://ejemplo.org/a.epub' }),
  book({ id: 'b', price: 18.5 }),
  book({ id: 'c', active: false }),
  book({ id: 'd', stock: 2 }),
];

describe('priceOrder', () => {
  it('calcula el total con precios del catálogo', () => {
    const { total, lines } = priceOrder(
      [
        { bookId: 'a', quantity: 1 },
        { bookId: 'b', quantity: 1 },
      ],
      catalog,
    );
    expect(total).toBe(28.49);
    expect(lines).toHaveLength(2);
  });

  it('agrupa ítems repetidos', () => {
    const { lines, total } = priceOrder(
      [
        { bookId: 'b', quantity: 1 },
        { bookId: 'b', quantity: 2 },
      ],
      catalog,
    );
    expect(lines).toEqual([expect.objectContaining({ bookId: 'b', quantity: 3, subtotal: 55.5 })]);
    expect(total).toBe(55.5);
  });

  it('evita errores de coma flotante', () => {
    const cheap = [book({ id: 'x', price: 0.1 })];
    expect(priceOrder([{ bookId: 'x', quantity: 3 }], cheap).total).toBe(0.3);
  });

  it.each([0, -1, 1.5])('rechaza la cantidad inválida %s', (quantity) => {
    expect(() => priceOrder([{ bookId: 'a', quantity }], catalog)).toThrow(PricingError);
  });

  it('rechaza libros inexistentes o inactivos', () => {
    expect(() => priceOrder([{ bookId: 'zzz', quantity: 1 }], catalog)).toThrow('BOOK_NOT_FOUND');
    expect(() => priceOrder([{ bookId: 'c', quantity: 1 }], catalog)).toThrow('BOOK_UNAVAILABLE');
  });

  it('rechaza cantidades mayores al stock (también sumando repetidos)', () => {
    expect(() => priceOrder([{ bookId: 'd', quantity: 3 }], catalog)).toThrow('OUT_OF_STOCK');
    expect(() =>
      priceOrder(
        [
          { bookId: 'd', quantity: 2 },
          { bookId: 'd', quantity: 1 },
        ],
        catalog,
      ),
    ).toThrow('OUT_OF_STOCK');
  });

  it('guarda el enlace de descarga solo para e-books', () => {
    const { lines } = priceOrder(
      [
        { bookId: 'a', quantity: 1 },
        { bookId: 'b', quantity: 1 },
      ],
      catalog,
    );
    expect(lines[0].downloadUrl).toBe('https://ejemplo.org/a.epub');
    expect(lines[1].downloadUrl).toBeUndefined();
  });
});
