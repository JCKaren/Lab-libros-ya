/**
 * Rotación de contraseña desde la terminal (sin exponerla en la interfaz ni en logs):
 *
 *   RESET_EMAIL=admin@librosya.com RESET_PASSWORD='nueva-clave-123' npm run set-password
 *
 * Opcional: RESET_ROLE=cliente|administrador para cambiar el rol (p. ej. revocar un admin).
 * Invalida todas las sesiones abiertas de esa cuenta.
 */
import { connectDatabase, disconnectDatabase } from '../config/db';
import { ROLES, type Role } from '../domain/roles';
import { UserModel } from '../models/User';
import { BcryptPasswordHasher } from '../services/PasswordHasher';
import { logger } from '../utils/logger';
import { passwordSchema } from '../validators/schemas';

async function main(): Promise<void> {
  const email = process.env.RESET_EMAIL?.trim().toLowerCase();
  const password = process.env.RESET_PASSWORD;
  const role = process.env.RESET_ROLE as Role | undefined;
  if (!email || !password) throw new Error('Define RESET_EMAIL y RESET_PASSWORD');
  const check = passwordSchema.safeParse(password);
  if (!check.success) throw new Error(`La contraseña no cumple la política: ${check.error.issues[0].message}`);
  if (role && !ROLES.includes(role)) throw new Error(`RESET_ROLE debe ser uno de: ${ROLES.join(', ')}`);

  await connectDatabase();
  const passwordHash = await new BcryptPasswordHasher().hash(password);
  const result = await UserModel.updateOne(
    { email },
    { $set: { passwordHash, ...(role ? { role } : {}) }, $inc: { tokenVersion: 1 } },
  );
  if (result.matchedCount === 0) throw new Error(`No existe una cuenta con el correo ${email}`);
  logger.info(`Contraseña actualizada para ${email}${role ? ` (rol: ${role})` : ''}; sesiones anteriores invalidadas`);
  await disconnectDatabase();
}

main().catch(async (err: Error) => {
  logger.error(err.message);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
