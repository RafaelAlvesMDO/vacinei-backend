import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';
import { UpdateUbsStatusDTO } from '../dtos/ubs.dto';

export class UpdateUbsStatusService {
  /**
   * Ativa ou desativa uma UBS (RF008 nota 8). A UBS nunca é excluída, pois
   * registros de vacinação e campanhas continuam apontando para ela (D10).
   */
  async execute(id: string, { isActive }: UpdateUbsStatusDTO) {
    const ubs = await prisma.ubs.findUnique({ where: { id }, select: { id: true } });

    if (!ubs) {
      throw new AppError('Unidade Básica de Saúde não encontrada.', 404);
    }

    return prisma.ubs.update({
      where: { id },
      data: { isActive },
    });
  }
}
