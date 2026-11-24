'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { authApi, configureHttp } from '../api';
import type { User } from '../types';

const TOKEN_KEY = 'librosya.token';

interface AuthValue {
  user: User | null;
  token: string | null;
  /** false mientras se restaura la sesión guardada (evita parpadeos y redirecciones erróneas). */
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const tokenRef = useRef<string | null>(null);

  const applySession = useCallback((nextToken: string | null, nextUser: User | null) => {
    tokenRef.current = nextToken;
    setToken(nextToken);
    setUser(nextUser);
    if (nextToken) window.localStorage.setItem(TOKEN_KEY, nextToken);
    else window.localStorage.removeItem(TOKEN_KEY);
  }, []);

  /** Borra la sesión local (sin llamar al servidor: se usa también ante un 401). */
  const clearSession = useCallback(() => applySession(null, null), [applySession]);

  /** Cierre de sesión explícito: revoca el token en el servidor y luego lo borra localmente. */
  const logout = useCallback(() => {
    const hadToken = tokenRef.current !== null;
    const revoke = hadToken ? authApi.logout().catch(() => undefined) : Promise.resolve();
    void revoke.finally(clearSession);
  }, [clearSession]);

  useEffect(() => {
    configureHttp({ getToken: () => tokenRef.current, onUnauthorized: clearSession });

    const saved = window.localStorage.getItem(TOKEN_KEY);
    tokenRef.current = saved;
    // El token guardado se valida contra el servidor antes de confiar en él.
    const restore = saved
      ? authApi
          .me()
          .then((me) => applySession(saved, me))
          .catch(() => applySession(null, null))
      : Promise.resolve();
    void restore.finally(() => setReady(true));
  }, [applySession, clearSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login({ email, password });
      applySession(res.token, res.user);
      return res.user;
    },
    [applySession],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await authApi.register({ name, email, password });
      applySession(res.token, res.user);
      return res.user;
    },
    [applySession],
  );

  const value = useMemo(() => ({ user, token, ready, login, register, logout }), [user, token, ready, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

/** Ruta de inicio según el rol. */
export const homeFor = (user: User) => (user.role === 'administrador' ? '/admin' : '/catalog');
