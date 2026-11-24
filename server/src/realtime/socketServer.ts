import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { AuthUser } from '../domain/entities';
import type { SessionService } from '../services/SessionService';
import { logger } from '../utils/logger';
import { ROOMS } from './events';

/** Cada cuánto se revalida la sesión de los sockets abiertos (rol cambiado, sesión cerrada, cuenta borrada). */
export const SOCKET_REVALIDATE_MS = 60_000;

interface SocketData {
  user: AuthUser;
  token: string;
  expiryTimer?: NodeJS.Timeout;
}

/**
 * Socket.IO en el mismo proceso que la API REST.
 * - El handshake se autentica con la misma sesión que la API (validada contra la BD).
 * - El SERVIDOR decide las salas: el navegador nunca elige a qué canal suscribirse.
 * - La conexión se cierra al vencer el token y cuando la sesión deja de ser válida.
 */
export function createSocketServer(
  httpServer: HttpServer,
  sessions: SessionService,
  allowedOrigins: string[],
  revalidateMs = SOCKET_REVALIDATE_MS,
): Server {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: false },
    maxHttpBufferSize: 10_000, // el cliente no envía datos: mensajes mínimos
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string') return next(new Error('UNAUTHORIZED'));
    sessions
      .resolve(token)
      .then((session) => {
        if (!session) return next(new Error('UNAUTHORIZED'));
        const data = socket.data as SocketData;
        data.user = session.user;
        data.token = token;
        // Desconexión exacta al vencer el token (con tope del temporizador de Node).
        const ms = Math.min(Math.max(session.expiresAt - Date.now(), 0), 2_147_483_647);
        data.expiryTimer = setTimeout(() => socket.disconnect(true), ms);
        next();
      })
      .catch(() => next(new Error('UNAUTHORIZED')));
  });

  io.on('connection', (socket) => {
    const { user } = socket.data as SocketData;
    void socket.join(ROOMS.user(user.id));
    if (user.role === 'administrador') void socket.join(ROOMS.admins);
    logger.info(`Socket conectado (${user.role})`);
    socket.on('disconnect', () => {
      clearTimeout((socket.data as SocketData).expiryTimer);
      logger.info(`Socket desconectado (${user.role})`);
    });
  });

  // Revalidación periódica: un administrador degradado deja de recibir datos de clientes.
  const timer = setInterval(() => void revalidateAll(io, sessions), revalidateMs);
  timer.unref();
  io.engine.on('close', () => clearInterval(timer));

  return io;
}

async function revalidateAll(io: Server, sessions: SessionService): Promise<void> {
  for (const socket of io.of('/').sockets.values()) {
    await revalidate(socket, sessions).catch((err: Error) => logger.warn(`Revalidación de socket falló: ${err.message}`));
  }
}

async function revalidate(socket: Socket, sessions: SessionService): Promise<void> {
  const data = socket.data as SocketData;
  const session = await sessions.resolve(data.token);
  if (!session || session.user.role !== data.user.role) socket.disconnect(true);
}
