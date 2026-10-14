import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';
import { UpdateProfileDTO } from '../dtos/auth.dto';

export class UpdateProfileService {
  // RS002: o id vem sempre do token, nunca do body
  async execute(userId: string, { name }: UpdateProfileDTO) {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new AppError('Usuário não encontrado.', 404);
    }

    return prisma.user.update({
      where: { id: userId },
      data: { name },
      select: {
        id: true,
        name: true,
        email: true,
        cpf: true,
        phone: true,
        birthDate: true,
        role: true,
        avatarUrl: true,
        updatedAt: true,
      },
    });
  }
}
