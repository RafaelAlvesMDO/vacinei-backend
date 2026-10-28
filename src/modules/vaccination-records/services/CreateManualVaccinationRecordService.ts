import { RecordOrigin, VaccineStatus } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { ManualVaccinationRecordDTO } from '../dtos/vaccination-record.dto';
import { CalculateVaccineStatusService } from './CalculateVaccineStatusService';
import { manualRecordSelect, validateManualRecord } from './manualRecordRules';

export class CreateManualVaccinationRecordService {
  /**
   * Cadastro manual de dose pelo titular (RF005 / RS003 / RS004). O registro nasce
   * aguardando confirmação (D06 / D30): qualquer status diferente de CONFIRMADO.
   */
  async execute(userId: string, data: ManualVaccinationRecordDTO) {
    await validateManualRecord(userId, data);

    const record = await prisma.vaccinationRecord.create({
      data: {
        userId,
        doseId: data.doseId,
        applicationDate: data.applicationDate,
        lotNumber: data.lote,
        status: VaccineStatus.EM_DIA,
        origin: RecordOrigin.MANUAL,
      },
      select: manualRecordSelect,
    });

    const calculateVaccineStatusService = new CalculateVaccineStatusService();
    const vaccineStatus = await calculateVaccineStatusService.execute(userId, data.vaccineId);

    return { record, vaccineStatus };
  }
}
