import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../config/prisma';
import { authConfig } from '../../../config/auth';
import { AppError } from '../../../errors/AppError';
import { RefreshTokenDTO } from '../dtos/auth.dto';

export class RefreshTokenService {
  async execute({ refreshToken }: RefreshTokenDTO) {
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!tokenRecord) {
      throw new AppError('Refresh token não encontrado.', 401);
    }

    if (tokenRecord.revokedAt) {
      throw new AppError('Refresh token já revogado.', 401);
    }

    if (new Date() > tokenRecord.expiresAt) {
      throw new AppError('Refresh token expirado.', 401);
    }

    if (!tokenRecord.user.isActive) {
      throw new AppError('Usuário associado a esta sessão está inativo.', 403);
    }

    // Rotação de Refresh Token: revoga o atual
    await prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revokedAt: new Date() },
    });

    // Gera novo access token
    const token = jwt.sign(
      { role: tokenRecord.user.role },
      authConfig.jwt.secret,
      {
        subject: tokenRecord.userId,
        expiresIn: authConfig.jwt.expiresIn as any,
      },
    );

    // Gera novo refresh token
    const newRefreshToken = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + authConfig.refreshToken.expiresInDays);

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: tokenRecord.userId,
        expiresAt,
      },
    });

    return {
      token,
      refreshToken: newRefreshToken,
    };
  }
}
