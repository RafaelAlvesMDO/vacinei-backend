import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { CheckVerifiedProfessionalService } from '../modules/users/services/CheckVerifiedProfessionalService';

// Exige profissional de saúde ativo com registro de conselho verificado (RS001 / RF010)
export async function ensureVerifiedProfessional(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    throw new AppError('Usuário não autenticado.', 401);
  }

  const checkVerifiedProfessionalService = new CheckVerifiedProfessionalService();
  const isVerified = await checkVerifiedProfessionalService.execute(req.user.id);

  if (!isVerified) {
    throw new AppError(
      'Acesso restrito a profissionais de saúde com registro verificado.',
      403,
    );
  }

  return next();
}
