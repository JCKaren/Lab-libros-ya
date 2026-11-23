export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Texto de contenido traducible (nombre y descripción de platos). */
export type LocalizedText = Record<Locale, string>;
