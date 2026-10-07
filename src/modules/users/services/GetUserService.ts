import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';

export class GetUserService {
  async execute(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
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
        updatedAt: true,
        professionalRegistry: true,
        dependents: {
          select: {
            id: true,
            name: true,
            birthDate: true,
            cpf: true,
            relationship: true,
            gender: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('Usuário não encontrado.', 404);
    }

    return user;
  }
}
