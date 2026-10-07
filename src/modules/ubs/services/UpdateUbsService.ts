import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';
import { UpdateUbsDTO } from '../dtos/ubs.dto';

export class UpdateUbsService {
  async execute(id: string, data: UpdateUbsDTO) {
    const ubs = await prisma.ubs.findUnique({
      where: { id },
    });

    if (!ubs) {
      throw new AppError('Unidade Básica de Saúde não encontrada.', 404);
    }

    if (data.cnes && data.cnes !== ubs.cnes) {
      const cnesConflict = await prisma.ubs.findUnique({
        where: { cnes: data.cnes },
      });

      if (cnesConflict) {
        throw new AppError('Já existe uma UBS cadastrada com este código CNES.', 409);
      }
    }

    const updatedUbs = await prisma.ubs.update({
      where: { id },
      data: {
        ...data,
        state: data.state ? data.state.toUpperCase() : undefined,
      },
    });

    return updatedUbs;
  }
}
