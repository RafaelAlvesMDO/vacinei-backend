import { prisma } from '../../../config/prisma';
import { findOwnEditableRecord } from './manualRecordRules';

export class DeleteManualVaccinationRecordService {
  /** Exclusão pelo titular enquanto o registro não estiver CONFIRMADO (D30). */
  async execute(userId: string, recordId: string) {
    await findOwnEditableRecord(userId, recordId);

    await prisma.vaccinationRecord.delete({ where: { id: recordId } });
  }
}
