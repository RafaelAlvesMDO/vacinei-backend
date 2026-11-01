import { UserRole } from '@prisma/client';
import { GetCitizenVaccinationCardService } from '../../vaccination-records/services/GetCitizenVaccinationCardService';
import { findOwnDependent } from './dependentRules';

interface IRequester {
  id: string;
  role: UserRole;
}

export class GetDependentVaccinationCardService {
  // Caderneta do dependente pelo responsável (RS004): mesmo cálculo e alertas do titular (D32)
  async execute(dependentId: string, requester: IRequester) {
    await findOwnDependent(requester.id, dependentId);

    const getCitizenVaccinationCardService = new GetCitizenVaccinationCardService();
    return getCitizenVaccinationCardService.execute(dependentId, requester);
  }
}
