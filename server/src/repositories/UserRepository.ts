import { isValidObjectId } from 'mongoose';
import type { User } from '../domain/entities';
import type { Role } from '../domain/roles';
import { UserModel, type UserDocument } from '../models/User';
import { AppError } from '../utils/AppError';

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
}

export interface AuthState {
  id: string;
  name: string;
  role: Role;
  tokenVersion: number;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  /** Estado mínimo para validar una sesión (rol actual y versión de token). */
  findAuthState(id: string): Promise<AuthState | null>;
  findByEmail(email: string): Promise<User | null>;
  findCredentialsByEmail(email: string): Promise<{ user: User; passwordHash: string; tokenVersion: number } | null>;
  /** Lanza EMAIL_TAKEN (409) si el correo ya existe, incluso en registros simultáneos. */
  create(input: CreateUserInput): Promise<User>;
  updateName(id: string, name: string): Promise<User | null>;
  /** Invalida todas las sesiones del usuario. Devuelve la nueva versión. */
  bumpTokenVersion(id: string): Promise<number | null>;
  /** Cambia la contraseña e invalida todas las sesiones. */
  setPassword(id: string, passwordHash: string): Promise<boolean>;
}

const toUser = (doc: UserDocument): User => ({
  id: doc.id,
  name: doc.name,
  email: doc.email,
  role: doc.role,
  createdAt: doc.createdAt,
});

export class MongoUserRepository implements UserRepository {
  async findById(id: string) {
    if (!isValidObjectId(id)) return null;
    const doc = await UserModel.findById(id);
    return doc ? toUser(doc) : null;
  }

  async findAuthState(id: string) {
    if (!isValidObjectId(id)) return null;
    const doc = await UserModel.findById(id).select('name role tokenVersion').lean();
    return doc ? { id, name: doc.name, role: doc.role, tokenVersion: doc.tokenVersion ?? 0 } : null;
  }

  async findByEmail(email: string) {
    const doc = await UserModel.findOne({ email: email.toLowerCase() });
    return doc ? toUser(doc) : null;
  }

  async findCredentialsByEmail(email: string) {
    const doc = await UserModel.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    return doc ? { user: toUser(doc), passwordHash: doc.passwordHash, tokenVersion: doc.tokenVersion ?? 0 } : null;
  }

  async create(input: CreateUserInput) {
    try {
      const doc = await UserModel.create(input);
      return toUser(doc);
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw AppError.conflict('EMAIL_TAKEN', 'Ya existe una cuenta con ese correo');
      throw err;
    }
  }

  async updateName(id: string, name: string) {
    if (!isValidObjectId(id)) return null;
    const doc = await UserModel.findByIdAndUpdate(id, { name }, { returnDocument: 'after', runValidators: true });
    return doc ? toUser(doc) : null;
  }

  async bumpTokenVersion(id: string) {
    if (!isValidObjectId(id)) return null;
    const doc = await UserModel.findByIdAndUpdate(id, { $inc: { tokenVersion: 1 } }, { returnDocument: 'after' }).select('tokenVersion').lean();
    return doc ? doc.tokenVersion : null;
  }

  async setPassword(id: string, passwordHash: string) {
    if (!isValidObjectId(id)) return false;
    const result = await UserModel.updateOne({ _id: id }, { $set: { passwordHash }, $inc: { tokenVersion: 1 } });
    return result.matchedCount === 1;
  }
}
