import { prisma } from '../../../config/prisma';
import { dependentSelect, findOwnDependent } from './dependentRules';

export class GetDependentService {
  async execute(responsibleId: string, dependentId: string) {
    await findOwnDependent(responsibleId, dependentId);

    return prisma.user.findUniqueOrThrow({ where: { id: dependentId }, select: dependentSelect });
  }
}
