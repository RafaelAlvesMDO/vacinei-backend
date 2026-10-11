import { UserRole } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';
import { professionalSelect, toProfessionalResponse } from './professionalPresenter';

export class VerifyProfessionalService {
  // Verificação manual do registro profissional pelo admin (RS001)
  async execute(professionalId: string, adminId: string) {
    const professional = await prisma.user.findFirst({
      where: { id: professionalId, role: UserRole.PROFISSIONAL_SAUDE },
      select: { professionalRegistry: { select: { id: true, isVerified: true } } },
    });

    if (!professional?.professionalRegistry) {
      throw new AppError('Profissional não encontrado.', 404);
    }

    if (professional.professionalRegistry.isVerified) {
      throw new AppError('Este profissional já está verificado.', 409);
    }

    await prisma.professionalRegistry.update({
      where: { id: professional.professionalRegistry.id },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
        verifiedById: adminId,
        rejectedAt: null,
        rejectedById: null,
        rejectionReason: null,
      },
    });

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: professionalId },
      select: professionalSelect,
    });

    return toProfessionalResponse(updated);
  }
}
