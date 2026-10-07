import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { ListVaccinesQueryDTO } from '../dtos/vaccine.dto';

export class ListVaccinesService {
  async execute({ targetAudience, search, isActive = true }: ListVaccinesQueryDTO) {
    const where: Prisma.VaccineWhereInput = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (targetAudience) {
      where.targetAudience = targetAudience;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { targetDisease: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const vaccines = await prisma.vaccine.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        doses: {
          orderBy: { doseNumber: 'asc' },
        },
      },
    });

    return vaccines;
  }
}
