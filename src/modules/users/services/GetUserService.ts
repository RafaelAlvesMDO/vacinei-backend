import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';
import { maskCpf } from '../../../utils/cpf';

export class GetUserService {
  async execute(userId: string, requesterId: string) {
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

    // LGPD: CPF completo (do titular e dos dependentes) só para o próprio titular
    if (requesterId === userId) return user;

    return {
      ...user,
      cpf: maskCpf(user.cpf),
      dependents: user.dependents.map((dependent) => ({ ...dependent, cpf: maskCpf(dependent.cpf) })),
    };
  }
}
