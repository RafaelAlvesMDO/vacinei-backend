import { prisma } from '../../../config/prisma';
import { CITIZEN_ROLES } from '../../../utils/citizenRoles';
import { calculateVaccineStatus } from '../../vaccination-records/services/CalculateVaccineStatusService';

export class GetDashboardSummaryService {
  /**
   * Indicadores do painel do profissional (RF009). Considera as cadernetas de
   * cidadãos e profissionais ativos (D11); dependentes entram com o RF012.
   * O status por vacina usa a mesma regra do CalculateVaccineStatusService, mas
   * em lote, para não consultar o banco a cada par cidadão/vacina.
   */
  async execute(referenceDate = new Date()) {
    const records = await prisma.vaccinationRecord.findMany({
      where: {
        dependentId: null,
        user: { role: { in: CITIZEN_ROLES }, isActive: true },
      },
      select: {
        userId: true,
        doseId: true,
        applicationDate: true,
        dose: { select: { vaccineId: true } },
        user: { select: { birthDate: true } },
      },
    });

    const vaccineIds = [...new Set(records.map((record) => record.dose.vaccineId))];
    const doses = await prisma.dose.findMany({ where: { vaccineId: { in: vaccineIds } } });

    const dosesByVaccine = new Map<string, typeof doses>();
    for (const dose of doses) {
      dosesByVaccine.set(dose.vaccineId, [...(dosesByVaccine.get(dose.vaccineId) ?? []), dose]);
    }

    // Agrupa por cidadão + vacina para calcular o status de cada esquema
    const byCitizenVaccine = new Map<string, typeof records>();
    for (const record of records) {
      const key = `${record.userId}:${record.dose.vaccineId}`;
      byCitizenVaccine.set(key, [...(byCitizenVaccine.get(key) ?? []), record]);
    }

    let totalDosesAtrasadas = 0;
    for (const group of byCitizenVaccine.values()) {
      const { status } = calculateVaccineStatus({
        doses: dosesByVaccine.get(group[0].dose.vaccineId) ?? [],
        records: group,
        birthDate: group[0].user?.birthDate,
        referenceDate,
      });

      if (status === 'ATRASADA') totalDosesAtrasadas++;
    }

    return {
      totalCadernetas: new Set(records.map((record) => record.userId)).size,
      totalVacinasRegistradas: records.length,
      totalDosesAtrasadas,
    };
  }
}
