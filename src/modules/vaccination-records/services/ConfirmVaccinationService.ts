import { RecordOrigin, UserRole, VaccineStatus } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../errors/AppError';
import { ConfirmVaccinationDTO } from '../dtos/vaccination-record.dto';
import { CalculateVaccineStatusService } from './CalculateVaccineStatusService';

const recordSelect = {
  id: true,
  userId: true,
  status: true,
  origin: true,
  applicationDate: true,
  lotNumber: true,
  createdAt: true,
  updatedAt: true,
  dose: {
    select: {
      id: true,
      doseNumber: true,
      doseName: true,
      vaccine: { select: { id: true, name: true } },
    },
  },
  appliedBy: { select: { id: true, name: true } },
} as const;

export class ConfirmVaccinationService {
  /**
   * Confirmação presencial de dose (RF010). O profissional responsável vem
   * sempre da sessão (RS006) e a data de aplicação é sempre a atual.
   * Se a dose já existir com registro manual/OCR, ela é promovida a CONFIRMADO (RF007 nota 7).
   */
  async execute(professionalId: string, { citizenId, vaccineId, doseId, lote }: ConfirmVaccinationDTO) {
    const citizen = await prisma.user.findFirst({
      where: { id: citizenId, role: UserRole.CIDADAO, isActive: true },
      select: { id: true },
    });

    if (!citizen) {
      throw new AppError('Cidadão não encontrado.', 404);
    }

    const vaccine = await prisma.vaccine.findFirst({
      where: { id: vaccineId, isActive: true },
      select: { id: true },
    });

    if (!vaccine) {
      throw new AppError('Vacina não encontrada.', 404);
    }

    const dose = await prisma.dose.findUnique({ where: { id: doseId }, select: { vaccineId: true } });

    if (!dose || dose.vaccineId !== vaccineId) {
      throw new AppError('A dose informada não pertence à vacina selecionada.', 400);
    }

    const existingRecords = await prisma.vaccinationRecord.findMany({
      where: { userId: citizenId, dependentId: null, doseId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, status: true },
    });

    if (existingRecords.some((record) => record.status === VaccineStatus.CONFIRMADO)) {
      throw new AppError('Esta dose já está confirmada na caderneta do cidadão.', 409);
    }

    const existingRecord = existingRecords[0];

    const confirmationData = {
      status: VaccineStatus.CONFIRMADO,
      applicationDate: new Date(),
      lotNumber: lote,
      appliedById: professionalId,
    };

    const record = existingRecord
      ? await prisma.vaccinationRecord.update({
          where: { id: existingRecord.id },
          data: confirmationData,
          select: recordSelect,
        })
      : await prisma.vaccinationRecord.create({
          data: {
            ...confirmationData,
            userId: citizenId,
            doseId,
            origin: RecordOrigin.SISTEMA_PRESENCIAL,
          },
          select: recordSelect,
        });

    const calculateVaccineStatusService = new CalculateVaccineStatusService();
    const vaccineStatus = await calculateVaccineStatusService.execute(citizenId, vaccineId);

    return {
      action: existingRecord ? ('CONFIRMED_EXISTING' as const) : ('CREATED' as const),
      record,
      vaccineStatus,
    };
  }
}
