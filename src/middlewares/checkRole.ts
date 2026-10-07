import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { AppError } from '../errors/AppError';

export function checkRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Usuário não autenticado.', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(
        'Acesso negado: perfil do usuário não tem permissão para esta operação.',
        403,
      );
    }

    return next();
  };
}
