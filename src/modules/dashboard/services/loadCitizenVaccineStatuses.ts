import { prisma } from '../../../config/prisma';
import { CITIZEN_ROLES } from '../../../utils/citizenRoles';
import { calculateAlertStatus } from '../../vaccination-records/services/CalculateVaccineStatusService';

/**
 * Carrega os registros das cadernetas de cidadãos e profissionais ativos (D11)
 * e calcula a situação de cada par pessoa/vacina com o calculateAlertStatus
 * (D32), em lote: doses atrasadas sem registro e doses informadas aguardando
 * conferência. Compartilhado pelo /summary e pelo /overdue para que o card
 * "Doses atrasadas" e a lista de busca ativa batam.
 * Dependentes entram com o RF012.
 */
export async function loadCitizenVaccineStatuses(referenceDate = new Date()) {
  const records = await prisma.vaccinationRecord.findMany({
    where: {
      dependentId: null,
      user: { role: { in: CITIZEN_ROLES }, isActive: true },
    },
    select: {
      userId: true,
      doseId: true,
      status: true,
      applicationDate: true,
      dose: { select: { vaccineId: true, vaccine: { select: { name: true } } } },
      user: { select: { name: true, cpf: true, birthDate: true } },
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

  const statuses = [...byCitizenVaccine.values()].map((group) => {
    const [{ userId, user, dose }] = group;

    return {
      userId,
      user,
      vaccineId: dose.vaccineId,
      vaccineName: dose.vaccine.name,
      ...calculateAlertStatus({
        doses: dosesByVaccine.get(dose.vaccineId) ?? [],
        records: group,
        birthDate: user?.birthDate,
        referenceDate,
      }),
    };
  });

  return { records, statuses };
}
