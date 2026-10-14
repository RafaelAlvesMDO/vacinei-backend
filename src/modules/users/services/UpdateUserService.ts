import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';
import { UpdateUserDTO } from '../dtos/user.dto';
import { maskCpf } from '../../../utils/cpf';

export class UpdateUserService {
  async execute(userId: string, data: UpdateUserDTO, requesterId: string) {
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!userExists) {
      throw new AppError('Usuário não encontrado.', 404);
    }

    const updateUser = prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.birthDate ? { birthDate: new Date(data.birthDate) } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
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
        updatedAt: true,
      },
    });

    // Desativação revoga todas as sessões ativas, como no DELETE
    const [updatedUser] =
      data.isActive === false
        ? await prisma.$transaction([
            updateUser,
            prisma.refreshToken.updateMany({
              where: { userId, revokedAt: null },
              data: { revokedAt: new Date() },
            }),
          ])
        : [await updateUser];

    // LGPD: CPF completo só para o próprio titular
    if (requesterId === userId) return updatedUser;

    return { ...updatedUser, cpf: maskCpf(updatedUser.cpf) };
  }
}
