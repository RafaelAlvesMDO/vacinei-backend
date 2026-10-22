import { Request, Response } from 'express';
import {
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  changePasswordSchema,
} from '../dtos/auth.dto';
import { UpdateProfileService } from '../services/UpdateProfileService';
import { ChangePasswordService } from '../services/ChangePasswordService';
import { AuthenticateUserService } from '../services/AuthenticateUserService';
import { RefreshTokenService } from '../services/RefreshTokenService';
import { LogoutService } from '../services/LogoutService';
import { ForgotPasswordService } from '../services/ForgotPasswordService';
import { ResetPasswordService } from '../services/ResetPasswordService';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';
import { toRegistrySummary } from '../../professionals/services/professionalPresenter';

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

  async logout(req: Request, res: Response): Promise<Response> {
    const validatedData = refreshTokenSchema.parse(req.body);

    const logoutService = new LogoutService();
    await logoutService.execute(validatedData);

    return res.status(204).send();
  }

  async forgotPassword(req: Request, res: Response): Promise<Response> {
    const validatedData = forgotPasswordSchema.parse(req.body);

    const forgotPasswordService = new ForgotPasswordService();
    await forgotPasswordService.execute(validatedData);

    // Resposta sempre igual para não permitir enumeração de contas
    return res.status(200).json({
      status: 'success',
      message: 'Se o e-mail estiver cadastrado, você receberá um código de recuperação.',
    });
  }

  async resetPassword(req: Request, res: Response): Promise<Response> {
    const validatedData = resetPasswordSchema.parse(req.body);

    const resetPasswordService = new ResetPasswordService();
    await resetPasswordService.execute(validatedData);

    return res.status(200).json({
      status: 'success',
      message: 'Senha redefinida com sucesso.',
    });
  }

  async updateProfile(req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw new AppError('Usuário não autenticado.', 401);
    }

    const validatedData = updateProfileSchema.parse(req.body);

    const updateProfileService = new UpdateProfileService();
    const user = await updateProfileService.execute(req.user.id, validatedData);

    return res.status(200).json({
      status: 'success',
      data: user,
    });
  }

  async changePassword(req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw new AppError('Usuário não autenticado.', 401);
    }

    const validatedData = changePasswordSchema.parse(req.body);

    const changePasswordService = new ChangePasswordService();
    await changePasswordService.execute(req.user.id, validatedData);

    return res.status(200).json({
      status: 'success',
      message: 'Senha alterada com sucesso.',
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
        // Consentimento LGPD: visível só para o próprio titular (D26)
        privacyConsentAt: true,
        privacyPolicyVersion: true,
        professionalRegistry: true,
        dependents: true,
      },
    });

    if (!user) {
      throw new AppError('Usuário não encontrado.', 404);
    }

    return res.status(200).json({
      status: 'success',
      data: {
        ...user,
        professionalRegistry: toRegistrySummary(user.role, user.professionalRegistry),
      },
    });
  }
}
