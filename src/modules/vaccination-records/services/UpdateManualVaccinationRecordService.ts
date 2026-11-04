import { prisma } from '../../../config/prisma';
import { ManualVaccinationRecordDTO } from '../dtos/vaccination-record.dto';
import { CalculateVaccineStatusService } from './CalculateVaccineStatusService';
import { ensureCanManageCard, findOwnEditableRecord, manualRecordSelect, validateManualRecord } from './manualRecordRules';

export class UpdateManualVaccinationRecordService {
  /** Edição pelo titular (ou pelo responsável, D33) enquanto o registro não estiver CONFIRMADO (D30). */
  async execute(requesterId: string, recordId: string, data: ManualVaccinationRecordDTO, subjectId = requesterId) {
    await ensureCanManageCard(requesterId, subjectId);
    await findOwnEditableRecord(subjectId, recordId);
    await validateManualRecord(subjectId, data, recordId);

    const record = await prisma.vaccinationRecord.update({
      where: { id: recordId },
      data: {
        doseId: data.doseId,
        applicationDate: data.applicationDate,
        lotNumber: data.lote ?? null,
        // A origem só muda se for informada; editar à mão uma dose do OCR pode marcá-la como MANUAL
        ...(data.origin && {
          origin: data.origin,
          ocrConfidence: data.origin === 'OCR_ICR' ? data.ocrConfidence ?? null : null,
        }),
      },
      select: manualRecordSelect,
    });

    const calculateVaccineStatusService = new CalculateVaccineStatusService();
    const vaccineStatus = await calculateVaccineStatusService.execute(subjectId, data.vaccineId);

    return { record, vaccineStatus };
  }
}
