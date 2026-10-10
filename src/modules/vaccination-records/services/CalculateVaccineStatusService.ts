import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';

export type VaccineScheduleStatus = 'EM_DIA' | 'ATRASADA' | 'COMPLETA';

export interface ScheduleDose {
  id: string;
  doseNumber: number;
  doseName: string;
  recommendedAgeMonths: number | null;
  intervalDaysFromPrevious: number | null;
}

export interface AppliedDoseRecord {
  doseId: string;
  applicationDate: Date | null;
}

export interface CalculateVaccineStatusInput {
  doses: ScheduleDose[];
  records: AppliedDoseRecord[];
  birthDate?: Date | null;
  referenceDate?: Date;
}

export interface VaccineStatusResult {
  status: VaccineScheduleStatus;
  appliedDoses: number;
  totalDoses: number;
  lastDose: { id: string; doseNumber: number; doseName: string; applicationDate: Date | null } | null;
  nextDose: { id: string; doseNumber: number; doseName: string } | null;
  nextDoseDate: Date | null;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_IN_MS);
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Regra pura de status vacinal (RF006 / RF007), sem acesso ao banco, para ser
 * reutilizada pela caderneta e pelo motor de alertas.
 * - COMPLETA: a última dose do esquema já foi aplicada.
 * - ATRASADA: a data prevista da próxima dose já passou.
 * - EM_DIA: próxima dose ainda dentro do prazo (ou sem data prevista calculável).
 * A data da próxima dose usa o intervalo desde a dose anterior; sem intervalo,
 * usa a idade recomendada a partir da data de nascimento.
 */
export function calculateVaccineStatus({
  doses,
  records,
  birthDate,
  referenceDate = new Date(),
}: CalculateVaccineStatusInput): VaccineStatusResult {
  const schedule = [...doses].sort((a, b) => a.doseNumber - b.doseNumber);
  const appliedByDoseId = new Map<string, Date | null>();

  for (const record of records) {
    const current = appliedByDoseId.get(record.doseId);
    // Em caso de registros repetidos da mesma dose, vale a aplicação mais recente
    if (current === undefined || (record.applicationDate && (!current || record.applicationDate > current))) {
      appliedByDoseId.set(record.doseId, record.applicationDate);
    }
  }

  let lastAppliedIndex = -1;
  schedule.forEach((dose, index) => {
    if (appliedByDoseId.has(dose.id)) lastAppliedIndex = index;
  });

  const appliedDoses = schedule.filter((dose) => appliedByDoseId.has(dose.id)).length;
  const lastScheduleDose = lastAppliedIndex >= 0 ? schedule[lastAppliedIndex] : null;
  const lastApplicationDate = lastScheduleDose ? appliedByDoseId.get(lastScheduleDose.id) ?? null : null;

  const lastDose = lastScheduleDose
    ? {
        id: lastScheduleDose.id,
        doseNumber: lastScheduleDose.doseNumber,
        doseName: lastScheduleDose.doseName,
        applicationDate: lastApplicationDate,
      }
    : null;

  const base = { appliedDoses, totalDoses: schedule.length, lastDose };

  if (schedule.length > 0 && lastAppliedIndex === schedule.length - 1) {
    return { ...base, status: 'COMPLETA', nextDose: null, nextDoseDate: null };
  }

  const next = schedule[lastAppliedIndex + 1];

  if (!next) {
    // Vacina sem esquema de doses cadastrado: nada a prever
    return { ...base, status: 'EM_DIA', nextDose: null, nextDoseDate: null };
  }

  let nextDoseDate: Date | null = null;

  if (lastApplicationDate && next.intervalDaysFromPrevious != null) {
    nextDoseDate = addDays(lastApplicationDate, next.intervalDaysFromPrevious);
  } else if (birthDate && next.recommendedAgeMonths != null) {
    nextDoseDate = addMonths(birthDate, next.recommendedAgeMonths);
  }

  const isOverdue =
    nextDoseDate !== null && startOfUtcDay(nextDoseDate) < startOfUtcDay(referenceDate);

  return {
    ...base,
    status: isOverdue ? 'ATRASADA' : 'EM_DIA',
    nextDose: { id: next.id, doseNumber: next.doseNumber, doseName: next.doseName },
    nextDoseDate,
  };
}

export class CalculateVaccineStatusService {
  async execute(citizenId: string, vaccineId: string, referenceDate = new Date()) {
    const [citizen, doses] = await Promise.all([
      prisma.user.findUnique({ where: { id: citizenId }, select: { birthDate: true } }),
      prisma.dose.findMany({ where: { vaccineId }, orderBy: { doseNumber: 'asc' } }),
    ]);

    if (!citizen) {
      throw new AppError('Cidadão não encontrado.', 404);
    }

    const records = await prisma.vaccinationRecord.findMany({
      where: {
        userId: citizenId,
        dependentId: null,
        doseId: { in: doses.map((dose) => dose.id) },
      },
      select: { doseId: true, applicationDate: true },
    });

    return calculateVaccineStatus({
      doses,
      records,
      birthDate: citizen.birthDate,
      referenceDate,
    });
  }
}
