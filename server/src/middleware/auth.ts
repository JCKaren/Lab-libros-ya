import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthUser } from '../domain/entities';
import type { Role } from '../domain/roles';
import { SessionService } from '../services/SessionService';
import { AppError } from '../utils/AppError';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

/**
 * Exige una sesión válida (`Authorization: Bearer <token>`). La sesión se valida
 * contra la base de datos: usuarios borrados, degradados o con sesión cerrada quedan fuera.
 */
export function authenticate(sessions: SessionService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    sessions
      .resolve(SessionService.bearer(req.headers.authorization))
      .then((session) => {
        if (!session) return next(AppError.unauthorized());
        req.auth = session.user;
        next();
      })
      .catch(next);
  };
}

/** Sesión opcional: rutas públicas que muestran más datos a un administrador. */
export function optionalAuth(sessions: SessionService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    sessions
      .resolve(SessionService.bearer(req.headers.authorization))
      .then((session) => {
        if (session) req.auth = session.user;
        next();
      })
      .catch(next);
  };
}

/** Autorización por rol. Debe usarse después de `authenticate`. */
export function authorize(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(AppError.unauthorized());
    if (!roles.includes(req.auth.role)) return next(AppError.forbidden());
    next();
  };
}

/** Devuelve el usuario autenticado o lanza 401 (útil en controladores). */
export function currentUser(req: Request): AuthUser {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
}
