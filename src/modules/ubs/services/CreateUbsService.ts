import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';
import { CreateUbsDTO } from '../dtos/ubs.dto';

export class CreateUbsService {
  async execute(data: CreateUbsDTO) {
    if (data.cnes) {
      const cnesExists = await prisma.ubs.findUnique({
        where: { cnes: data.cnes },
      });

      if (cnesExists) {
        throw new AppError('Já existe uma UBS cadastrada com este código CNES.', 409);
      }
    }

    const ubs = await prisma.ubs.create({
      data: {
        ...data,
        state: data.state.toUpperCase(),
      },
    });

    return ubs;
  }
}
