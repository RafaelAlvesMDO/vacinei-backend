import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { ListUsersQueryDTO } from '../dtos/user.dto';
import { maskCpf, normalizeCpf } from '../../../utils/cpf';
import { buildPage, toSkipTake } from '../../../utils/pagination';

export class ListUsersService {
  async execute({ role, isActive, search, page, limit }: ListUsersQueryDTO) {
    // Filtros comuns à lista e aos contadores; o status fica de fora para alimentar as abas
    const baseWhere: Prisma.UserWhereInput = {};

    if (role) {
      baseWhere.role = role;
    }

    if (search) {
      // CPF é salvo só com dígitos; o termo pode vir com máscara
      const cpfDigits = normalizeCpf(search);

      baseWhere.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        ...(cpfDigits ? [{ cpf: { contains: cpfDigits } }] : []),
      ];
    }

    const where: Prisma.UserWhereInput = isActive === undefined ? baseWhere : { ...baseWhere, isActive };

    const [total, users, active, inactive] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        ...toSkipTake({ page, limit }),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          cpf: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          professionalRegistry: true,
        },
      }),
      prisma.user.count({ where: { ...baseWhere, isActive: true } }),
      prisma.user.count({ where: { ...baseWhere, isActive: false } }),
    ]);

    return {
      // LGPD: listagens nunca expõem o CPF completo
      ...buildPage(users.map((user) => ({ ...user, cpf: maskCpf(user.cpf) })), total, { page, limit }),
      counts: { active, inactive },
    };
  }
}
