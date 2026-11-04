import { UserRole } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { DependentDTO } from '../dtos/dependent.dto';
import { dependentSelect, validateDependent } from './dependentRules';

export class CreateDependentService {
  /**
   * Cadastro de dependente pelo responsável (RF012 / D33): um CIDADAO sem e-mail e senha,
   * ligado ao responsável, que reaproveita a caderneta, os alertas e a confirmação de dose.
   */
  async execute(responsibleId: string, data: DependentDTO) {
    await validateDependent(responsibleId, data);

    return prisma.user.create({
      data: {
        name: data.name,
        birthDate: data.birthDate,
        sex: data.sex,
        cpf: data.cpf,
        relationship: data.relationship,
        role: UserRole.CIDADAO,
        responsibleId,
      },
      select: dependentSelect,
    });
  }
}
