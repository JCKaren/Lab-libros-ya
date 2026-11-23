export const BOOK_CATEGORIES = ['ficcion', 'no_ficcion', 'ciencia', 'tecnologia', 'infantil'] as const;
export type BookCategory = (typeof BOOK_CATEGORIES)[number];

/**
 * ebook: entrega digital (el stock representa licencias disponibles).
 * impreso: requiere envío físico.
 */
export const BOOK_FORMATS = ['ebook', 'impreso'] as const;
export type BookFormat = (typeof BOOK_FORMATS)[number];

/** Umbral para alertar al administrador de stock bajo. */
export const LOW_STOCK_THRESHOLD = 3;

export const requiresShipping = (format: BookFormat): boolean => format === 'impreso';
