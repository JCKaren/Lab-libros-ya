'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface AsyncState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
  setData: (updater: (prev: T | undefined) => T | undefined) => void;
}

/** Carga datos asíncronos con estados de carga/error y recarga manual. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setDataState] = useState<T>();
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- inicio de una carga asíncrona
    setLoading(true);
    loaderRef
      .current()
      .then((result) => {
        if (!active) return;
        setDataState(result);
        setError(null);
      })
      .catch((err: unknown) => active && setError(err))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((updater: (prev: T | undefined) => T | undefined) => setDataState(updater), []);

  return { data, error, loading, reload, setData };
}
