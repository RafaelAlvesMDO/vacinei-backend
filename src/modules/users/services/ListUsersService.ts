import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { ListUsersQueryDTO } from '../dtos/user.dto';
import { maskCpf, normalizeCpf } from '../../../utils/cpf';

export class ListUsersService {
  async execute({ role, search, page = 1, limit = 20 }: ListUsersQueryDTO) {
    const where: Prisma.UserWhereInput = {};

    if (role) {
      where.role = role;
    }

    if (search) {
      // CPF é salvo só com dígitos; o termo pode vir com máscara
      const cpfDigits = normalizeCpf(search);

      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        ...(cpfDigits ? [{ cpf: { contains: cpfDigits } }] : []),
      ];
    }

    const skip = (page - 1) * limit;

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
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
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      // LGPD: listagens nunca expõem o CPF completo
      users: users.map((user) => ({ ...user, cpf: maskCpf(user.cpf) })),
    };
  }
}
