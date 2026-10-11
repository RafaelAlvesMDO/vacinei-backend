import { UserRole } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';
import { RejectProfessionalDTO } from '../dtos/professional.dto';
import { professionalSelect, toProfessionalResponse } from './professionalPresenter';

export class RejectProfessionalService {
  /**
   * Recusa a verificação (RS001). A conta continua ativa, mas sem verificação:
   * o ensureVerifiedProfessional bloqueia as ações clínicas. Se o profissional
   * já estava verificado, a verificação é revogada.
   */
  async execute(professionalId: string, adminId: string, { reason }: RejectProfessionalDTO) {
    const professional = await prisma.user.findFirst({
      where: { id: professionalId, role: UserRole.PROFISSIONAL_SAUDE },
      select: {
        professionalRegistry: { select: { id: true, isVerified: true, rejectedAt: true } },
      },
    });

    const registry = professional?.professionalRegistry;

    if (!registry) {
      throw new AppError('Profissional não encontrado.', 404);
    }

    if (!registry.isVerified && registry.rejectedAt) {
      throw new AppError('A verificação deste profissional já foi recusada.', 409);
    }

    await prisma.professionalRegistry.update({
      where: { id: registry.id },
      data: {
        isVerified: false,
        verifiedAt: null,
        verifiedById: null,
        rejectedAt: new Date(),
        rejectedById: adminId,
        rejectionReason: reason ?? null,
      },
    });

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: professionalId },
      select: professionalSelect,
    });

    return toProfessionalResponse(updated);
  }
}
