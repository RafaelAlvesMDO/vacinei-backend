import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';

export class DeleteUbsService {
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

    if (ubs._count.vaccinationRecords > 0 || ubs._count.campaigns > 0) {
      await prisma.ubs.update({
        where: { id },
        data: { isActive: false },
      });

      return {
        message: 'UBS desativada com sucesso (mantida para histórico de atendimentos e campanhas).',
      };
    }

    await prisma.ubs.delete({
      where: { id },
    });

    return {
      message: 'Unidade Básica de Saúde removida com sucesso.',
    };
  }
}
