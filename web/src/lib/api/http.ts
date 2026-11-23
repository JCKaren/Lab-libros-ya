import { API_URL } from '../config';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

type TokenProvider = () => string | null;
let getToken: TokenProvider = () => null;
let onUnauthorized: () => void = () => undefined;

/** El AuthProvider registra cómo obtener el token y qué hacer ante un 401. */
export function configureHttp(options: { getToken: TokenProvider; onUnauthorized: () => void }) {
  getToken = options.getToken;
  onUnauthorized = options.onUnauthorized;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | undefined>;
  signal?: AbortSignal;
}

/** Cliente HTTP único: agrega el token, serializa JSON y normaliza errores. */
export async function http<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${API_URL}/api${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor');
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    const error = (data as { error?: { code?: string; message?: string; details?: unknown } }).error;
    throw new ApiError(res.status, error?.code ?? 'UNKNOWN', error?.message ?? 'Error inesperado', error?.details);
  }
  return data as T;
}
