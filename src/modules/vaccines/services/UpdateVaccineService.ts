import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';
import { UpdateVaccineDTO } from '../dtos/vaccine.dto';

export class UpdateVaccineService {
  async execute(id: string, data: UpdateVaccineDTO) {
    const vaccineExists = await prisma.vaccine.findUnique({
      where: { id },
    });

    if (!vaccineExists) {
      throw new AppError('Vacina não encontrada.', 404);
    }

    if (data.name && data.name !== vaccineExists.name) {
      const nameConflict = await prisma.vaccine.findUnique({
        where: { name: data.name },
      });

      if (nameConflict) {
        throw new AppError('Já existe uma vacina cadastrada com este nome.', 409);
      }
    }

    const updatedVaccine = await prisma.vaccine.update({
      where: { id },
      data,
      include: {
        doses: {
          orderBy: { doseNumber: 'asc' },
        },
      },
    });

    return updatedVaccine;
  }
}
