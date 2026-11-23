import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth';
import type { AuthService } from '../services/AuthService';
import { loginSchema, parse, registerSchema, updateProfileSchema } from '../validators/schemas';

export class AuthController {
  constructor(private readonly auth: AuthService) {}

  register = async (req: Request, res: Response) => {
    const result = await this.auth.register(parse(registerSchema, req.body));
    res.status(201).json(result);
  };

  login = async (req: Request, res: Response) => {
    res.json(await this.auth.login(parse(loginSchema, req.body)));
  };

  me = async (req: Request, res: Response) => {
    res.json({ user: await this.auth.me(currentUser(req).id) });
  };

  updateMe = async (req: Request, res: Response) => {
    res.json({ user: await this.auth.updateProfile(currentUser(req).id, parse(updateProfileSchema, req.body)) });
  };
}
