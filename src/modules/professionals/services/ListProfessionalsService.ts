import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { ListProfessionalsQueryDTO } from '../dtos/professional.dto';
import { buildPage, toSkipTake } from '../../../utils/pagination';
import { professionalSelect, toProfessionalResponse, VerificationStatus } from './professionalPresenter';

// Mesma regra de getVerificationStatus, traduzida para filtro do banco
const statusWhere: Record<VerificationStatus, Prisma.UserWhereInput> = {
  VERIFICADO: { professionalRegistry: { is: { isVerified: true } } },
  RECUSADO: { professionalRegistry: { is: { isVerified: false, rejectedAt: { not: null } } } },
  PENDENTE: {
    OR: [
      { professionalRegistry: { is: null } },
      { professionalRegistry: { is: { isVerified: false, rejectedAt: null } } },
    ],
  },
};

export class ListProfessionalsService {
  async execute({ status, search, page, limit }: ListProfessionalsQueryDTO) {
    // Filtros comuns à lista e aos contadores; o status fica de fora para alimentar as abas
    const baseWhere: Prisma.UserWhereInput = { role: UserRole.PROFISSIONAL_SAUDE };

    if (search) {
      baseWhere.name = { contains: search, mode: 'insensitive' };
    }

    const where: Prisma.UserWhereInput = status ? { AND: [baseWhere, statusWhere[status]] } : baseWhere;
    const countByStatus = (value: VerificationStatus) =>
      prisma.user.count({ where: { AND: [baseWhere, statusWhere[value]] } });

    const [total, professionals, PENDENTE, VERIFICADO, RECUSADO] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        ...toSkipTake({ page, limit }),
        orderBy: { createdAt: 'asc' },
        select: professionalSelect,
      }),
      countByStatus('PENDENTE'),
      countByStatus('VERIFICADO'),
      countByStatus('RECUSADO'),
    ]);

    return {
      ...buildPage(professionals.map(toProfessionalResponse), total, { page, limit }),
      counts: { PENDENTE, VERIFICADO, RECUSADO },
    };
  }
}
