import { prisma } from '../../../config/prisma';
import { DependentDTO } from '../dtos/dependent.dto';
import { dependentSelect, findOwnDependent, validateDependent } from './dependentRules';

export class UpdateDependentService {
  /** Edição dos dados básicos pelo responsável (RF012); o PUT substitui nome, nascimento, sexo, CPF e parentesco. */
  async execute(responsibleId: string, dependentId: string, data: DependentDTO) {
    const current = await findOwnDependent(responsibleId, dependentId);
    await validateDependent(responsibleId, data, current);

    return prisma.user.update({
      where: { id: dependentId },
      data: {
        name: data.name,
        birthDate: data.birthDate,
        sex: data.sex,
        cpf: data.cpf ?? null,
        relationship: data.relationship ?? null,
      },
      select: dependentSelect,
    });
  }
}
