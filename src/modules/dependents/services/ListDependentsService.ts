import { prisma } from '../../../config/prisma';
import { dependentSelect } from './dependentRules';

export class ListDependentsService {
  // Dependentes do próprio responsável (RF012); CPF completo, pois são dados do titular (D14)
  async execute(responsibleId: string) {
    return prisma.user.findMany({
      where: { responsibleId },
      orderBy: [{ birthDate: 'desc' }, { name: 'asc' }],
      select: dependentSelect,
    });
  }
}
