import { createServer } from 'node:http';
import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/db';
import { env } from './config/env';
import { createContainer } from './container';
import { createSocketServer } from './realtime/socketServer';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  await connectDatabase();

  const container = createContainer();
  const app = createApp(container, env.clientOrigins);
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer, container.tokens, env.clientOrigins);
  container.attachRealtime(io);

  httpServer.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`API + WebSockets escuchando en el puerto ${env.PORT} (pagos: ${env.PAYMENT_PROVIDER})`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} recibido, cerrando...`);
    io.close();
    httpServer.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: Error) => {
  // Falla controlada: mensaje claro sin imprimir la URI ni credenciales.
  logger.error(`No se pudo iniciar el servidor: ${err.message}`);
  process.exit(1);
});
