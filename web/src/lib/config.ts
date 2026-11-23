/**
 * Única variable pública del frontend: la URL de la API (no es un secreto).
 * Los secretos (MongoDB, JWT, PayPal secret) viven exclusivamente en el backend.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
