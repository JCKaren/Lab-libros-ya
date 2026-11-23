import { isValidObjectId } from 'mongoose';
import type { User } from '../domain/entities';
import type { Role } from '../domain/roles';
import { UserModel, type UserDocument } from '../models/User';

export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findCredentialsByEmail(email: string): Promise<{ user: User; passwordHash: string } | null>;
  create(input: CreateUserInput): Promise<User>;
  updateName(id: string, name: string): Promise<User | null>;
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

  async findByEmail(email: string) {
    const doc = await UserModel.findOne({ email: email.toLowerCase() });
    return doc ? toUser(doc) : null;
  }

  async findCredentialsByEmail(email: string) {
    const doc = await UserModel.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    return doc ? { user: toUser(doc), passwordHash: doc.passwordHash } : null;
  }

  async create(input: CreateUserInput) {
    const doc = await UserModel.create(input);
    return toUser(doc);
  }

  async updateName(id: string, name: string) {
    if (!isValidObjectId(id)) return null;
    const doc = await UserModel.findByIdAndUpdate(id, { name }, { new: true, runValidators: true });
    return doc ? toUser(doc) : null;
  }
}
