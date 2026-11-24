import { createServer } from 'node:http';
import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/db';
import { env } from './config/env';
import { createContainer } from './container';
import { createSocketServer } from './realtime/socketServer';
import { logger } from './utils/logger';

const MAINTENANCE_INTERVAL_MS = 60_000;

async function main(): Promise<void> {
  await connectDatabase();

  const container = createContainer();
  const app = createApp(container, env.clientOrigins, env.trustProxy);
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer, container.sessions, env.clientOrigins);
  container.attachRealtime(io);

  // Conciliación de cobros interrumpidos/pendientes y vencimiento de pedidos sin pagar.
  const maintenance = setInterval(() => {
    container
      .maintenance()
      .then(({ settled, expired }) => {
        if (settled || expired) logger.info(`Mantenimiento: ${settled} cobro(s) conciliado(s), ${expired} pedido(s) vencido(s)`);
      })
      .catch((err: Error) => logger.error(`Mantenimiento falló: ${err.message}`));
  }, MAINTENANCE_INTERVAL_MS);
  maintenance.unref();

  httpServer.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`API + WebSockets escuchando en el puerto ${env.PORT} (pagos: ${env.PAYMENT_PROVIDER})`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} recibido, cerrando...`);
    clearInterval(maintenance);
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
