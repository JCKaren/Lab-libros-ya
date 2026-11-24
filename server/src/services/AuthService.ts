import type { User } from '../domain/entities';
import type { UserRepository } from '../repositories/UserRepository';
import { AppError } from '../utils/AppError';
import type { PasswordHasher } from './PasswordHasher';
import type { TokenService } from './TokenService';

export interface AuthResult {
  token: string;
  user: User;
}

export class AuthService {
  /** Hash ficticio para igualar el tiempo de respuesta cuando el correo no existe. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  /** El registro público siempre crea clientes; los administradores se crean por seed. */
  async register(input: { name: string; email: string; password: string }): Promise<AuthResult> {
    if (await this.users.findByEmail(input.email)) {
      throw AppError.conflict('EMAIL_TAKEN', 'Ya existe una cuenta con ese correo');
    }
    const passwordHash = await this.hasher.hash(input.password);
    const user = await this.users.create({ name: input.name, email: input.email, passwordHash, role: 'cliente' });
    return this.issue(user, 0);
  }

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    const found = await this.users.findCredentialsByEmail(input.email);
    const valid = await this.hasher.compare(input.password, found?.passwordHash ?? (await this.getDummyHash()));
    if (!found || !valid) {
      // Mensaje genérico: no revela si el correo existe.
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos');
    }
    return this.issue(found.user, found.tokenVersion);
  }

  /** Cierra la sesión en todos los dispositivos: los JWT emitidos antes dejan de valer. */
  async logout(userId: string): Promise<void> {
    await this.users.bumpTokenVersion(userId);
  }

  async me(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) throw AppError.unauthorized();
    return user;
  }

  async updateProfile(userId: string, input: { name: string }): Promise<User> {
    const user = await this.users.updateName(userId, input.name);
    if (!user) throw AppError.notFound('Usuario');
    return user;
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash('librosya-timing-equalizer');
    return this.dummyHash;
  }

  private issue(user: User, tokenVersion: number): AuthResult {
    return { token: this.tokens.signSession({ id: user.id, tokenVersion }), user };
  }
}
