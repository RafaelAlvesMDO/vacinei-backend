import { prisma } from '../../../config/prisma';
import { CITIZEN_ROLES } from '../../../utils/citizenRoles';
import { RecentDosesQueryDTO } from '../dtos/dashboard.dto';

export class GetRecentDosesService {
  // Últimas doses em cadernetas de cidadãos e profissionais (RF009, D11); dependentes ficam para o RF012
  async execute({ limit }: RecentDosesQueryDTO) {
    const records = await prisma.vaccinationRecord.findMany({
      where: {
        dependentId: null,
        user: { role: { in: CITIZEN_ROLES }, isActive: true },
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
