import { prisma } from '../../../config/prisma';
import { RefreshTokenDTO } from '../dtos/auth.dto';

export class LogoutService {
  // Idempotente (D27): token inexistente, expirado ou já revogado não gera erro
  async execute({ refreshToken }: RefreshTokenDTO) {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
