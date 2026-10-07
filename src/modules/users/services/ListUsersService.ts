import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { ListUsersQueryDTO } from '../dtos/user.dto';

export class ListUsersService {
  async execute({ role, search, page = 1, limit = 20 }: ListUsersQueryDTO) {
    const where: Prisma.UserWhereInput = {};

    if (role) {
      where.role = role;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { cpf: { contains: search, mode: 'insensitive' } },
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
      users,
    };
  }
}
