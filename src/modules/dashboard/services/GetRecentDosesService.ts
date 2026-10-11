import { UserRole } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { RecentDosesQueryDTO } from '../dtos/dashboard.dto';

export class GetRecentDosesService {
  // Últimas doses registradas em cadernetas de cidadãos (RF009); dependentes ficam para o RF012
  async execute({ limit }: RecentDosesQueryDTO) {
    const records = await prisma.vaccinationRecord.findMany({
      where: {
        dependentId: null,
        user: { role: UserRole.CIDADAO, isActive: true },
      },
      orderBy: [{ applicationDate: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        status: true,
        applicationDate: true,
        user: { select: { id: true, name: true } },
        dose: {
          select: {
            id: true,
            doseNumber: true,
            doseName: true,
            vaccine: { select: { id: true, name: true } },
          },
        },
      },
    });

    return records.map(({ user, dose: { vaccine, ...dose }, ...record }) => ({
      id: record.id,
      citizen: user,
      vaccine,
      dose,
      applicationDate: record.applicationDate,
      status: record.status,
    }));
  }
}
