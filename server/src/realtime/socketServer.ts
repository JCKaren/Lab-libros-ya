import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { AuthUser } from '../domain/entities';
import type { TokenService } from '../services/TokenService';
import { logger } from '../utils/logger';
import { ROOMS } from './events';

/**
 * Socket.IO en el mismo proceso que la API REST.
 * El handshake se autentica con el JWT y el SERVIDOR decide las salas:
 * el navegador nunca elige a qué canal suscribirse.
 */
export function createSocketServer(httpServer: HttpServer, tokens: TokenService, allowedOrigins: string[]): Server {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const user = typeof token === 'string' ? tokens.verify(token) : null;
    if (!user) return next(new Error('UNAUTHORIZED'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as AuthUser;
    void socket.join(ROOMS.user(user.id));
    if (user.role === 'administrador') void socket.join(ROOMS.admins);
    logger.info(`Socket conectado (${user.role})`);
    socket.on('disconnect', () => logger.info(`Socket desconectado (${user.role})`));
  });

  return io;
}
