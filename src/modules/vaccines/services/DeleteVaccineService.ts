import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';

export class DeleteVaccineService {
  async execute(id: string) {
    const vaccine = await prisma.vaccine.findUnique({
      where: { id },
      include: {
        doses: {
          select: { id: true },
        },
      },
    });

    if (!vaccine) {
      throw new AppError('Vacina não encontrada.', 404);
    }

    const doseIds = vaccine.doses.map((d) => d.id);

    const hasVaccinationRecords = await prisma.vaccinationRecord.count({
      where: {
        doseId: { in: doseIds },
      },
    });

    if (hasVaccinationRecords > 0) {
      // Se já houver registros de aplicação, realiza exclusão lógica para integridade histórica
      await prisma.vaccine.update({
        where: { id },
        data: { isActive: false },
      });

      return {
        message: 'Vacina desativada com sucesso (mantida para histórico de imunizações aplicadas).',
      };
    }

    // Se não houver vínculos, pode ser removida fisicamente
    await prisma.vaccine.delete({
      where: { id },
    });

    return {
      message: 'Vacina removida com sucesso do sistema.',
    };
  }
}
