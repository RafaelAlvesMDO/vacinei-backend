import { VaccineStatus } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';
import { findOwnDependent } from './dependentRules';

export class DeleteDependentService {
  /**
   * Remoção pelo responsável (D33). Dose confirmada por profissional é dado de saúde
   * validado por terceiro: com ela o dependente não pode ser removido. Sem ela, o
   * cadastro e os registros ainda pendentes são apagados.
   */
  async execute(responsibleId: string, dependentId: string) {
    await findOwnDependent(responsibleId, dependentId);

    const confirmedDose = await prisma.vaccinationRecord.findFirst({
      where: { userId: dependentId, status: VaccineStatus.CONFIRMADO },
      select: { id: true },
    });

    if (confirmedDose) {
      throw new AppError('Este dependente possui doses confirmadas por um profissional e não pode ser removido.', 409);
    }

    await prisma.$transaction([
      prisma.vaccinationRecord.deleteMany({ where: { userId: dependentId } }),
      prisma.user.delete({ where: { id: dependentId } }),
    ]);
  }
}
