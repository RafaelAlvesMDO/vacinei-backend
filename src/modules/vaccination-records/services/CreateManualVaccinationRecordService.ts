import { RecordOrigin, VaccineStatus } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { ManualVaccinationRecordDTO } from '../dtos/vaccination-record.dto';
import { CalculateVaccineStatusService } from './CalculateVaccineStatusService';
import { ensureCanManageCard, manualRecordSelect, validateManualRecord } from './manualRecordRules';

export class CreateManualVaccinationRecordService {
  /**
   * Cadastro manual de dose pelo titular (RF005 / RS003 / RS004), na própria caderneta
   * ou na de um dependente (`subjectId`, D33). O registro nasce aguardando confirmação
   * (D06 / D30): qualquer status diferente de CONFIRMADO.
   */
  async execute(requesterId: string, data: ManualVaccinationRecordDTO, subjectId = requesterId) {
    await ensureCanManageCard(requesterId, subjectId);
    await validateManualRecord(subjectId, data);

    const record = await prisma.vaccinationRecord.create({
      data: {
        userId: subjectId,
        doseId: data.doseId,
        applicationDate: data.applicationDate,
        lotNumber: data.lote,
        status: VaccineStatus.EM_DIA,
        // Dose vinda do OCR e conferida pelo cidadão continua aguardando confirmação (D25 / D34)
        origin: data.origin === 'OCR_ICR' ? RecordOrigin.OCR_ICR : RecordOrigin.MANUAL,
        ocrConfidence: data.origin === 'OCR_ICR' ? data.ocrConfidence ?? null : null,
      },
      select: manualRecordSelect,
    });

    const calculateVaccineStatusService = new CalculateVaccineStatusService();
    const vaccineStatus = await calculateVaccineStatusService.execute(subjectId, data.vaccineId);

    return { record, vaccineStatus };
  }
}
