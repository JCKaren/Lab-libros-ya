import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { ROLES } from '../domain/roles';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, default: 'cliente' },
    /** Se incrementa al cerrar sesión o cambiar la contraseña: invalida todos los JWT emitidos antes. */
    tokenVersion: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<UserAttrs>;
export const UserModel = model('User', userSchema);
