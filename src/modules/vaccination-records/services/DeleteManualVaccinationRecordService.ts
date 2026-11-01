import { prisma } from '../../../config/prisma';
import { ensureCanManageCard, findOwnEditableRecord } from './manualRecordRules';

export class DeleteManualVaccinationRecordService {
  /** Exclusão pelo titular (ou pelo responsável, D33) enquanto o registro não estiver CONFIRMADO (D30). */
  async execute(requesterId: string, recordId: string, subjectId = requesterId) {
    await ensureCanManageCard(requesterId, subjectId);
    await findOwnEditableRecord(subjectId, recordId);

    await prisma.vaccinationRecord.delete({ where: { id: recordId } });
  }
}
