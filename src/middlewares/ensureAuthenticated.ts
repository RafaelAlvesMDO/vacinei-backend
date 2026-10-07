import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { authConfig } from '../config/auth';
import { AppError } from '../errors/AppError';

interface ITokenPayload {
  sub: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export function ensureAuthenticated(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AppError('Token de autenticação não informado.', 401);
  }

  const [scheme, token] = authHeader.split(' ');

  if (!/^Bearer$/i.test(scheme) || !token) {
    throw new AppError('Formato do token inválido. Esperado: Bearer <token>.', 401);
  }

  try {
    const decoded = jwt.verify(token, authConfig.jwt.secret) as ITokenPayload;

    req.user = {
      id: decoded.sub,
      role: decoded.role,
    };

    return next();
  } catch {
    throw new AppError('Token JWT inválido ou expirado.', 401);
  }
}
