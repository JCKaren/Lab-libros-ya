import type { AuthUser } from '../domain/entities';
import type { UserRepository } from '../repositories/UserRepository';
import type { TokenService } from './TokenService';

export interface Session {
  user: AuthUser;
  /** Expiración del token en milisegundos (epoch). */
  expiresAt: number;
}

/**
 * Resuelve un JWT a una sesión válida consultando la base de datos:
 * - el usuario debe seguir existiendo;
 * - la versión del token debe coincidir (cerrar sesión o cambiar contraseña la invalida);
 * - el rol y el nombre son los actuales, no los que había al emitir el token.
 */
export class SessionService {
  constructor(
    private readonly tokens: TokenService,
    private readonly users: UserRepository,
  ) {}

  async resolve(token: string | undefined): Promise<Session | null> {
    if (!token) return null;
    const claims = this.tokens.verifySession(token);
    if (!claims) return null;
    const state = await this.users.findAuthState(claims.userId);
    if (!state || state.tokenVersion !== claims.version) return null;
    return { user: { id: state.id, role: state.role, name: state.name }, expiresAt: claims.exp * 1000 };
  }

  /** Extrae el token de `Authorization: Bearer <token>`. */
  static bearer(header: string | undefined): string | undefined {
    const [scheme, token] = (header ?? '').split(' ');
    return scheme === 'Bearer' && token ? token : undefined;
  }
}
