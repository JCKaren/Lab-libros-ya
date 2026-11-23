import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB desconectado'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconectado'));

  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  logger.info(`MongoDB conectado (base: ${mongoose.connection.name})`);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
