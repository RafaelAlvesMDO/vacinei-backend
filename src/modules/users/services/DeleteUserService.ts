import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';

export class DeleteUserService {
  async execute(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('Usuário não encontrado.', 404);
    }

    // Desativa o usuário e revoga todas as sessões ativas
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { isActive: false },
      }),
      prisma.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),
    ]);

    return { message: 'Conta de usuário desativada com sucesso.' };
  }
}
