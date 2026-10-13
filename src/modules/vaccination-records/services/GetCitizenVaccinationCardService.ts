import { UserRole } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { CITIZEN_ROLES } from '../../../utils/citizenRoles';
import { AppError } from '../../../errors/AppError';
import { CheckVerifiedProfessionalService } from '../../users/services/CheckVerifiedProfessionalService';
import { calculateVaccineStatus } from './CalculateVaccineStatusService';

interface IRequester {
  id: string;
  role: UserRole;
}

export class GetCitizenVaccinationCardService {
  async execute(citizenId: string, requester: IRequester) {
    // RS002: apenas o próprio titular ou um profissional verificado acessa a caderneta
    const isOwner = requester.id === citizenId;

    if (!isOwner) {
      const checkVerifiedProfessionalService = new CheckVerifiedProfessionalService();
      const isVerifiedProfessional = await checkVerifiedProfessionalService.execute(requester.id);

      if (!isVerifiedProfessional) {
        throw new AppError('Acesso negado à caderneta deste cidadão.', 403);
      }
    }

    const citizen = await prisma.user.findFirst({
      where: { id: citizenId, role: { in: CITIZEN_ROLES }, isActive: true },
      select: { id: true, name: true, birthDate: true },
    });

    if (!citizen) {
      throw new AppError('Cidadão não encontrado.', 404);
    }

    const records = await prisma.vaccinationRecord.findMany({
      where: { userId: citizenId, dependentId: null },
      orderBy: [{ applicationDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        doseId: true,
        status: true,
        origin: true,
        applicationDate: true,
        lotNumber: true,
        dose: {
          select: {
            id: true,
            doseNumber: true,
            doseName: true,
            vaccine: {
              select: {
                id: true,
                name: true,
                targetDisease: true,
                dosesCount: true,
                doses: {
                  orderBy: { doseNumber: 'asc' },
                  select: {
                    id: true,
                    doseNumber: true,
                    doseName: true,
                    recommendedAgeMonths: true,
                    intervalDaysFromPrevious: true,
                  },
                },
              },
            },
          },
        },
        ubs: { select: { id: true, name: true } },
        appliedBy: { select: { id: true, name: true } },
      },
    });

    // Agrupa os registros por vacina, preservando a ordem cronológica de aplicação
    const byVaccine = new Map<string, typeof records>();
    for (const record of records) {
      const vaccineId = record.dose.vaccine.id;
      byVaccine.set(vaccineId, [...(byVaccine.get(vaccineId) ?? []), record]);
    }

    const referenceDate = new Date();

    const vaccines = [...byVaccine.values()]
      .map((vaccineRecords) => {
        const { doses, ...vaccine } = vaccineRecords[0].dose.vaccine;
        const statusResult = calculateVaccineStatus({
          doses,
          records: vaccineRecords,
          birthDate: citizen.birthDate,
          referenceDate,
        });

        return {
          vaccine,
          ...statusResult,
          records: vaccineRecords.map(({ doseId: _doseId, dose, ...record }) => ({
            ...record,
            dose: { id: dose.id, doseNumber: dose.doseNumber, doseName: dose.doseName },
          })),
        };
      })
      .sort((a, b) => a.vaccine.name.localeCompare(b.vaccine.name, 'pt-BR'));

    const summary = {
      totalVaccines: vaccines.length,
      emDia: vaccines.filter((v) => v.status === 'EM_DIA').length,
      atrasadas: vaccines.filter((v) => v.status === 'ATRASADA').length,
      completas: vaccines.filter((v) => v.status === 'COMPLETA').length,
    };

    return { citizen, summary, vaccines };
  }
}
