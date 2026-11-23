import jwt, { type SignOptions } from 'jsonwebtoken';
import type { AuthUser } from '../domain/entities';
import { ROLES, type Role } from '../domain/roles';

export interface TokenService {
  sign(user: AuthUser): string;
  /** Devuelve el usuario si el token es válido; null en cualquier otro caso. */
  verify(token: string): AuthUser | null;
}

export class JwtTokenService implements TokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string,
  ) {}

  sign(user: AuthUser): string {
    return jwt.sign({ role: user.role, name: user.name }, this.secret, {
      subject: user.id,
      expiresIn: this.expiresIn as SignOptions['expiresIn'],
      algorithm: 'HS256',
    });
  }

  verify(token: string): AuthUser | null {
    try {
      const payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] });
      if (typeof payload === 'string' || !payload.sub) return null;
      const role = payload.role as Role;
      if (!ROLES.includes(role)) return null;
      return { id: payload.sub, role, name: String(payload.name ?? '') };
    } catch {
      return null;
    }
  }
}
