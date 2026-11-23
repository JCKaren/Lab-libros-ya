'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import type { Book, CartLine } from '../types';

const STORAGE_KEY = 'librosya.cart';
const MAX_QTY = 20;

type Action =
  | { type: 'hydrate'; lines: CartLine[] }
  | { type: 'add'; book: Book }
  | { type: 'setQty'; bookId: string; quantity: number }
  | { type: 'remove'; bookId: string }
  | { type: 'clear' };

interface State {
  lines: CartLine[];
  hydrated: boolean;
}

/** Tope de unidades por línea: el stock conocido (el servidor vuelve a validarlo). */
const maxFor = (line: Pick<CartLine, 'stock'>) => Math.max(0, Math.min(MAX_QTY, line.stock));

/** Reducer puro: toda la lógica del carrito es predecible y fácil de probar. */
function cartReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrate':
      return { lines: action.lines, hydrated: true };
    case 'add': {
      const existing = state.lines.find((l) => l.bookId === action.book.id);
      if (existing) return cartReducer(state, { type: 'setQty', bookId: existing.bookId, quantity: existing.quantity + 1 });
      const { id, title, author, format, price, stock, coverUrl } = action.book;
      if (stock < 1) return state;
      return { ...state, lines: [...state.lines, { bookId: id, title, author, format, price, stock, coverUrl, quantity: 1 }] };
    }
    case 'setQty': {
      const line = state.lines.find((l) => l.bookId === action.bookId);
      if (!line) return state;
      const quantity = Math.min(maxFor(line), Math.max(0, Math.floor(action.quantity)));
      if (quantity === 0) return cartReducer(state, { type: 'remove', bookId: action.bookId });
      return { ...state, lines: state.lines.map((l) => (l.bookId === action.bookId ? { ...l, quantity } : l)) };
    }
    case 'remove':
      return { ...state, lines: state.lines.filter((l) => l.bookId !== action.bookId) };
    case 'clear':
      return { ...state, lines: [] };
  }
}

interface CartValue {
  lines: CartLine[];
  count: number;
  /** Total estimado solo para mostrar; el backend recalcula con precios reales. */
  estimatedTotal: number;
  /** true si hay al menos un libro impreso (se pide dirección). */
  needsShipping: boolean;
  add: (book: Book) => void;
  setQuantity: (bookId: string, quantity: number) => void;
  remove: (bookId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartValue | null>(null);

function readSaved(): CartLine[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as CartLine[];
    return Array.isArray(saved) ? saved.filter((l) => typeof l.bookId === 'string' && l.quantity > 0) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { lines: [], hydrated: false });

  useEffect(() => {
    dispatch({ type: 'hydrate', lines: readSaved() });
  }, []);

  useEffect(() => {
    if (state.hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.lines));
  }, [state]);

  const add = useCallback((book: Book) => dispatch({ type: 'add', book }), []);
  const setQuantity = useCallback((bookId: string, quantity: number) => dispatch({ type: 'setQty', bookId, quantity }), []);
  const remove = useCallback((bookId: string) => dispatch({ type: 'remove', bookId }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  const value = useMemo<CartValue>(() => {
    const count = state.lines.reduce((sum, l) => sum + l.quantity, 0);
    const cents = state.lines.reduce((sum, l) => sum + Math.round(l.price * 100) * l.quantity, 0);
    const needsShipping = state.lines.some((l) => l.format === 'impreso');
    return { lines: state.lines, count, estimatedTotal: cents / 100, needsShipping, add, setQuantity, remove, clear };
  }, [state.lines, add, setQuantity, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart debe usarse dentro de <CartProvider>');
  return ctx;
}
