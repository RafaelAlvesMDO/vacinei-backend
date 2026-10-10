import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { ListProfessionalsQueryDTO } from '../dtos/professional.dto';
import { professionalSelect, toProfessionalResponse } from './professionalPresenter';

export class ListProfessionalsService {
  async execute({ verified }: ListProfessionalsQueryDTO) {
    const where: Prisma.UserWhereInput = { role: UserRole.PROFISSIONAL_SAUDE };

    if (verified !== undefined) {
      where.professionalRegistry = { isVerified: verified };
    }

    const professionals = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: professionalSelect,
    });

    return professionals.map(toProfessionalResponse);
  }
}
