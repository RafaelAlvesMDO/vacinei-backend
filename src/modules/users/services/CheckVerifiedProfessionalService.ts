import { UserRole } from '@prisma/client';
import { prisma } from '../../../config/prisma';

export class CheckVerifiedProfessionalService {
  async execute(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        isActive: true,
        professionalRegistry: { select: { isVerified: true } },
      },
    });

    return Boolean(
      user &&
        user.isActive &&
        user.role === UserRole.PROFISSIONAL_SAUDE &&
        user.professionalRegistry?.isVerified,
    );
  }
}
