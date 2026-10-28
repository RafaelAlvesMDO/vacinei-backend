import { prisma } from '../../../config/prisma';
import { ManualVaccinationRecordDTO } from '../dtos/vaccination-record.dto';
import { CalculateVaccineStatusService } from './CalculateVaccineStatusService';
import { findOwnEditableRecord, manualRecordSelect, validateManualRecord } from './manualRecordRules';

export class UpdateManualVaccinationRecordService {
  /** Edição pelo titular enquanto o registro não estiver CONFIRMADO (D30). */
  async execute(userId: string, recordId: string, data: ManualVaccinationRecordDTO) {
    await findOwnEditableRecord(userId, recordId);
    await validateManualRecord(userId, data, recordId);

    const record = await prisma.vaccinationRecord.update({
      where: { id: recordId },
      data: {
        doseId: data.doseId,
        applicationDate: data.applicationDate,
        lotNumber: data.lote ?? null,
      },
      select: manualRecordSelect,
    });

    const calculateVaccineStatusService = new CalculateVaccineStatusService();
    const vaccineStatus = await calculateVaccineStatusService.execute(userId, data.vaccineId);

    return { record, vaccineStatus };
  }
}
