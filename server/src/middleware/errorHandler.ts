import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', 'Ruta no encontrada'));
};

/** Manejo centralizado: respuestas uniformes y sin filtrar trazas ni secretos. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } });
    return;
  }

  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'La solicitud es demasiado grande' } });
    return;
  }

  // Índice único violado (p. ej. dos registros simultáneos con el mismo correo).
  if (err?.code === 11000) {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'El recurso ya existe' } });
    return;
  }

  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'JSON mal formado' } });
    return;
  }

  logger.error(`Error no controlado en ${req.method} ${req.path}`, err instanceof Error ? err.message : err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado' } });
};
