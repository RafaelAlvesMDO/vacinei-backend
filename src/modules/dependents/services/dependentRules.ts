import { DependentRelationship } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';
import { normalizeName } from '../../../utils/normalizeName';
import { DependentDTO } from '../dtos/dependent.dto';

const ADULT_AGE = 18;

export const dependentSelect = {
  id: true,
  name: true,
  birthDate: true,
  cpf: true,
  sex: true,
  relationship: true,
  createdAt: true,
  updatedAt: true,
} as const;

const toDay = (date: Date) => date.toISOString().slice(0, 10);

// Idade em anos completos na data de referência (datas de nascimento são gravadas sem horário)
function ageInYears(birthDate: Date, referenceDate = new Date()) {
  let age = referenceDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    referenceDate.getUTCMonth() < birthDate.getUTCMonth() ||
    (referenceDate.getUTCMonth() === birthDate.getUTCMonth() && referenceDate.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * RS004: só o responsável acessa o dependente. Um dependente de outra pessoa (ou um id
 * que não é dependente) responde 404, sem revelar se o cadastro existe.
 */
export async function findOwnDependent(responsibleId: string, dependentId: string) {
  const dependent = await prisma.user.findFirst({
    where: { id: dependentId, responsibleId },
    select: { id: true, birthDate: true, cpf: true, relationship: true },
  });

  if (!dependent) {
    throw new AppError('Dependente não encontrado.', 404);
  }

  return dependent;
}

type CurrentDependent = Awaited<ReturnType<typeof findOwnDependent>>;

/**
 * Regras do cadastro e da edição do dependente (RF012 / RS008 / D33):
 * - menor de 18 anos no cadastro (ECA), exceto CURATELADO; quem completa 18 depois segue cadastrado;
 * - CPF único em toda a base;
 * - mesmo nome (normalizado) e data de nascimento não se repetem para o mesmo responsável;
 * - na edição, a nova data de nascimento não pode ficar depois de uma dose já registrada.
 */
export async function validateDependent(responsibleId: string, data: DependentDTO, current?: CurrentDependent) {
  const birthDateChanged = !current || toDay(current.birthDate!) !== toDay(data.birthDate);
  const relationshipChanged = !current || current.relationship !== (data.relationship ?? null);

  if (
    (birthDateChanged || relationshipChanged) &&
    data.relationship !== DependentRelationship.CURATELADO &&
    ageInYears(data.birthDate) >= ADULT_AGE
  ) {
    throw new AppError(
      'O dependente deve ter menos de 18 anos. Maiores de idade só podem ser cadastrados com o parentesco CURATELADO.',
      400,
    );
  }

  if (data.cpf && data.cpf !== current?.cpf) {
    const cpfInUse = await prisma.user.findUnique({ where: { cpf: data.cpf }, select: { id: true } });

    if (cpfInUse) {
      throw new AppError('Já existe uma pessoa cadastrada com este CPF.', 409);
    }
  }

  const sameBirthDate = await prisma.user.findMany({
    where: {
      responsibleId,
      birthDate: data.birthDate,
      ...(current && { id: { not: current.id } }),
    },
    select: { name: true },
  });

  if (sameBirthDate.some(({ name }) => normalizeName(name) === normalizeName(data.name))) {
    throw new AppError('Você já cadastrou um dependente com este nome e data de nascimento.', 409);
  }

  if (current && birthDateChanged) {
    const doseBeforeBirth = await prisma.vaccinationRecord.findFirst({
      where: { userId: current.id, applicationDate: { lt: data.birthDate } },
      select: { id: true },
    });

    if (doseBeforeBirth) {
      throw new AppError('A data de nascimento não pode ser posterior a uma dose já registrada na caderneta.', 400);
    }
  }
}
