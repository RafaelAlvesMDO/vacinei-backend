import { VaccineStatus } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';
import { ManualVaccinationRecordDTO } from '../dtos/vaccination-record.dto';

export const manualRecordSelect = {
  id: true,
  userId: true,
  status: true,
  origin: true,
  applicationDate: true,
  lotNumber: true,
  createdAt: true,
  updatedAt: true,
  dose: {
    select: {
      id: true,
      doseNumber: true,
      doseName: true,
      vaccine: { select: { id: true, name: true } },
    },
  },
} as const;

const toDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Validações do registro manual (RS003): vacina ativa, dose da vacina, data entre o
 * nascimento e hoje e dose ainda não registrada na caderneta do titular.
 * Na edição, `ignoreRecordId` exclui o próprio registro da checagem de duplicidade.
 */
export async function validateManualRecord(
  userId: string,
  { vaccineId, doseId, applicationDate }: ManualVaccinationRecordDTO,
  ignoreRecordId?: string,
) {
  const vaccine = await prisma.vaccine.findFirst({
    where: { id: vaccineId, isActive: true },
    select: { id: true },
  });

  if (!vaccine) {
    throw new AppError('Vacina não encontrada.', 404);
  }

  const dose = await prisma.dose.findUnique({ where: { id: doseId }, select: { vaccineId: true } });

  if (!dose || dose.vaccineId !== vaccineId) {
    throw new AppError('A dose informada não pertence à vacina selecionada.', 400);
  }

  if (applicationDate > new Date()) {
    throw new AppError('A data de aplicação não pode ser futura.', 400);
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { birthDate: true } });

  // Comparação por dia: a data de nascimento é gravada sem horário
  if (user?.birthDate && toDay(applicationDate) < toDay(user.birthDate)) {
    throw new AppError('A data de aplicação não pode ser anterior à data de nascimento.', 400);
  }

  const duplicate = await prisma.vaccinationRecord.findFirst({
    where: {
      userId,
      dependentId: null,
      doseId,
      ...(ignoreRecordId && { id: { not: ignoreRecordId } }),
    },
    select: { id: true },
  });

  if (duplicate) {
    throw new AppError('Esta dose já está registrada na sua caderneta.', 409);
  }
}

/**
 * Busca um registro que o titular ainda pode editar ou excluir (D30): precisa ser da
 * própria caderneta (não de dependente) e não pode estar CONFIRMADO.
 */
export async function findOwnEditableRecord(userId: string, recordId: string) {
  const record = await prisma.vaccinationRecord.findUnique({
    where: { id: recordId },
    select: { id: true, userId: true, dependentId: true, status: true },
  });

  if (!record) {
    throw new AppError('Registro de vacinação não encontrado.', 404);
  }

  if (record.userId !== userId || record.dependentId !== null) {
    throw new AppError('Acesso negado a este registro de vacinação.', 403);
  }

  if (record.status === VaccineStatus.CONFIRMADO) {
    throw new AppError('Registros confirmados por um profissional não podem ser alterados.', 403);
  }

  return record;
}
