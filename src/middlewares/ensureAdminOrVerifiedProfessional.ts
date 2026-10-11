import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { ensureVerifiedProfessional } from './ensureVerifiedProfessional';

// Libera ADMIN ou profissional verificado. Use só em rotas de dados agregados (LGPD: princípio da necessidade)
export async function ensureAdminOrVerifiedProfessional(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    throw new AppError('Usuário não autenticado.', 401);
  }

  if (req.user.role === UserRole.ADMIN) {
    return next();
  }

  return ensureVerifiedProfessional(req, res, next);
}
