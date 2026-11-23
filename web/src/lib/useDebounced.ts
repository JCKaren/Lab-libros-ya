'use client';

import { useEffect, useState } from 'react';

/** Devuelve el valor tras `delay` ms sin cambios (evita una petición por cada tecla). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
