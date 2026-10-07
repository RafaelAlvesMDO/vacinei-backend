import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';

export class GetUbsService {
  async execute(id: string) {
    const ubs = await prisma.ubs.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            vaccinationRecords: true,
            campaigns: true,
          },
        },
      },
    });

    if (!ubs) {
      throw new AppError('Unidade Básica de Saúde não encontrada.', 404);
    }

    return ubs;
  }
}
