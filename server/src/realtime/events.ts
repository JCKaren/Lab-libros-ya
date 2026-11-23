/** Nombres de eventos y salas compartidos por todo el backend (evita strings mágicos). */
export const SOCKET_EVENTS = {
  orderCreated: 'order:created',
  orderStatusChanged: 'order:statusChanged',
  orderUpdated: 'order:updated',
  stockChanged: 'book:stockChanged',
} as const;

export const ROOMS = {
  admins: 'admins',
  user: (userId: string) => `user:${userId}`,
} as const;
