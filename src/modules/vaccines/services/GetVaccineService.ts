import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';

export class GetVaccineService {
  async execute(id: string) {
    const vaccine = await prisma.vaccine.findUnique({
      where: { id },
      include: {
        doses: {
          orderBy: { doseNumber: 'asc' },
        },
      },
    });

    if (!vaccine) {
      throw new AppError('Vacina não encontrada.', 404);
    }

    return vaccine;
  }
}
