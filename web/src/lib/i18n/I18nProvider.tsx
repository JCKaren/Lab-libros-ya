'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '../api';
import type { Locale, LocalizedText } from '../types';
import { en } from './en';
import { es, type Dictionary } from './es';

const DICTIONARIES: Record<Locale, Dictionary> = { es, en };
const STORAGE_KEY = 'librosya.locale';

interface I18nValue {
  locale: Locale;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
  /** Elige el idioma correcto de un contenido traducible (ej. título de un libro). */
  pick: (text: LocalizedText) => string;
  formatPrice: (amount: number, currency?: string) => string;
  formatDate: (iso: string) => string;
  /** Traduce un error de la API usando su código estable. */
  errorMessage: (err: unknown) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('es');

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura única de preferencia guardada
    if (saved === 'es' || saved === 'en') setLocaleState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<I18nValue>(() => {
    const t = DICTIONARIES[locale];
    const intlLocale = locale === 'es' ? 'es-CO' : 'en-US';
    return {
      locale,
      t,
      setLocale,
      pick: (text) => text[locale] || text.es,
      formatPrice: (amount, currency = 'USD') => new Intl.NumberFormat(intlLocale, { style: 'currency', currency }).format(amount),
      formatDate: (iso) => new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)),
      errorMessage: (err) => {
        if (err instanceof ApiError) {
          const known = t.errors[err.code as keyof Dictionary['errors']];
          return known ?? err.message ?? t.errors.UNKNOWN;
        }
        return t.errors.UNKNOWN;
      },
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n debe usarse dentro de <I18nProvider>');
  return ctx;
}
