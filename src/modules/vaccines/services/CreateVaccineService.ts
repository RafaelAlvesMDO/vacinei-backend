import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';
import { CreateVaccineDTO } from '../dtos/vaccine.dto';
import { findVaccineNameConflict } from './findVaccineNameConflict';

export class CreateVaccineService {
  async execute(data: CreateVaccineDTO) {
    const { name, description, targetAudience, targetDisease, dosesCount, doses } = data;

    const nameConflict = await findVaccineNameConflict(name);

    if (nameConflict) {
      throw new AppError('Já existe uma vacina cadastrada com este nome.', 409);
    }

    const vaccine = await prisma.vaccine.create({
      data: {
        name,
        description,
        targetAudience,
        targetDisease,
        dosesCount,
        ...(doses && doses.length > 0
          ? {
              doses: {
                create: doses.map((d) => ({
                  doseNumber: d.doseNumber,
                  doseName: d.doseName,
                  recommendedAgeMonths: d.recommendedAgeMonths ?? null,
                  intervalDaysFromPrevious: d.intervalDaysFromPrevious ?? null,
                  description: d.description ?? null,
                })),
              },
            }
          : {}),
      },
      include: {
        doses: {
          orderBy: { doseNumber: 'asc' },
        },
      },
    });

    return vaccine;
  }
}
