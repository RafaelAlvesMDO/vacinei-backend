import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../config/prisma';
import { authConfig } from '../../../config/auth';
import { AppError } from '../../../errors/AppError';
import { ResetPasswordDTO } from '../dtos/auth.dto';
import { hashResetCode } from './ForgotPasswordService';

const INVALID_CODE_MESSAGE = 'Código inválido ou expirado.';
const BLOCKED_MESSAGE = 'Muitas tentativas inválidas. Tente novamente mais tarde.';

export class ResetPasswordService {
  async execute({ email, code, newPassword }: ResetPasswordDTO): Promise<void> {
    const { maxAttempts, blockMinutes } = authConfig.passwordReset;
    const now = new Date();

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      throw new AppError(INVALID_CODE_MESSAGE, 400);
    }

    const blockedCode = await prisma.passwordResetCode.findFirst({
      where: { userId: user.id, blockedUntil: { gt: now } },
    });

    if (blockedCode) {
      throw new AppError(BLOCKED_MESSAGE, 429);
    }

    const resetCode = await prisma.passwordResetCode.findFirst({
      where: { userId: user.id, isUsed: false, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });

    if (!resetCode) {
      throw new AppError(INVALID_CODE_MESSAGE, 400);
    }

    const isCodeValid = crypto.timingSafeEqual(
      Buffer.from(hashResetCode(code)),
      Buffer.from(resetCode.code),
    );

    if (!isCodeValid) {
      // Incremento atômico para não perder tentativas em requisições concorrentes
      const updated = await prisma.passwordResetCode.update({
        where: { id: resetCode.id },
        data: { attempts: { increment: 1 } },
      });

      if (updated.attempts >= maxAttempts) {
        // Bloqueia e invalida o código: após o bloqueio é preciso solicitar um novo
        await prisma.passwordResetCode.update({
          where: { id: resetCode.id },
          data: {
            isUsed: true,
            blockedUntil: new Date(now.getTime() + blockMinutes * 60 * 1000),
          },
        });

        throw new AppError(BLOCKED_MESSAGE, 429);
      }

      throw new AppError(INVALID_CODE_MESSAGE, 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, authConfig.bcryptSaltRounds);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      prisma.passwordResetCode.update({
        where: { id: resetCode.id },
        data: { isUsed: true },
      }),
      // Encerra todas as sessões ativas do usuário
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }
}
