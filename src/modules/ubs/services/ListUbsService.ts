import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { calculateDistanceInKm } from '../../../utils/distance';
import { ListUbsQueryDTO } from '../dtos/ubs.dto';

export class ListUbsService {
  // Público vê só UBSs ativas; ADMIN pode incluir as desativadas com includeInactive
  async execute(query: ListUbsQueryDTO, requesterRole?: UserRole) {
    const { search, city, state, latitude, longitude, radiusKm = 15, includeInactive } = query;

    const where: Prisma.UbsWhereInput = {};

    if (!(includeInactive && requesterRole === UserRole.ADMIN)) {
      where.isActive = true;
    }

    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }

    if (state) {
      where.state = state.toUpperCase();
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { neighborhood: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { cnes: { contains: search, mode: 'insensitive' } },
      ];
    }

    const ubss = await prisma.ubs.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    // Se coordenadas forem informadas, calcula a distância e ordena pela mais próxima
    if (latitude !== undefined && longitude !== undefined) {
      const ubssWithDistance = ubss
        .map((ubs) => {
          const distanceKm = calculateDistanceInKm(
            latitude,
            longitude,
            ubs.latitude,
            ubs.longitude,
          );
          return {
            ...ubs,
            distanceKm,
          };
        })
        .filter((ubs) => ubs.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);

      return ubssWithDistance;
    }

    return ubss;
  }
}
