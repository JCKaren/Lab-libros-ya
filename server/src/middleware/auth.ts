import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthUser } from '../domain/entities';
import type { Role } from '../domain/roles';
import type { TokenService } from '../services/TokenService';
import { AppError } from '../utils/AppError';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

/** Exige un JWT válido en `Authorization: Bearer <token>`. */
export function authenticate(tokens: TokenService): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    const user = scheme === 'Bearer' && token ? tokens.verify(token) : null;
    if (!user) return next(AppError.unauthorized());
    req.auth = user;
    next();
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
