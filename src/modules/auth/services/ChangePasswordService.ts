import bcrypt from 'bcryptjs';
import { prisma } from '../../../config/prisma';
import { authConfig } from '../../../config/auth';
import { AppError } from '../../../errors/AppError';
import { ChangePasswordDTO } from '../dtos/auth.dto';

export class ChangePasswordService {
  async execute(
    userId: string,
    { currentPassword, newPassword, refreshToken }: ChangePasswordDTO,
  ): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new AppError('Usuário não encontrado.', 404);
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!isCurrentValid) {
      throw new AppError('Senha atual incorreta.', 401);
    }

    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new AppError('A nova senha deve ser diferente da atual.', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, authConfig.bcryptSaltRounds);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      // Encerra as outras sessões; a atual é mantida se o refresh token dela for informado
      prisma.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(refreshToken && { token: { not: refreshToken } }),
        },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}
