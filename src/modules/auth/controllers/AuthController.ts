import { Request, Response } from 'express';
import { loginSchema, refreshTokenSchema } from '../dtos/auth.dto';
import { AuthenticateUserService } from '../services/AuthenticateUserService';
import { RefreshTokenService } from '../services/RefreshTokenService';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';

export class AuthController {
  async login(req: Request, res: Response): Promise<Response> {
    const validatedData = loginSchema.parse(req.body);

    const authenticateService = new AuthenticateUserService();
    const result = await authenticateService.execute(validatedData);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  }

  async refresh(req: Request, res: Response): Promise<Response> {
    const validatedData = refreshTokenSchema.parse(req.body);

    const refreshTokenService = new RefreshTokenService();
    const result = await refreshTokenService.execute(validatedData);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  }

  async me(req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw new AppError('Usuário não autenticado.', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        cpf: true,
        phone: true,
        birthDate: true,
        role: true,
        avatarUrl: true,
        isActive: true,
        createdAt: true,
        professionalRegistry: true,
        dependents: true,
      },
    });

    if (!user) {
      throw new AppError('Usuário não encontrado.', 404);
    }

    return res.status(200).json({
      status: 'success',
      data: user,
    });
  }
}
