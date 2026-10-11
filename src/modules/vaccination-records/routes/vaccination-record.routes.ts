import { Router } from 'express';
import { VaccinationRecordController } from '../controllers/VaccinationRecordController';
import { ensureAuthenticated } from '../../../middlewares/ensureAuthenticated';
import { ensureVerifiedProfessional } from '../../../middlewares/ensureVerifiedProfessional';

export const vaccinationRecordRoutes = Router();
export const citizenVaccinationRecordRoutes = Router();
const vaccinationRecordController = new VaccinationRecordController();

// Confirmação presencial de dose (RF010 / RS006)
vaccinationRecordRoutes.post(
  '/confirm',
  ensureAuthenticated,
  ensureVerifiedProfessional,
  vaccinationRecordController.confirm,
);

// Caderneta do cidadão (RF006): titular ou profissional verificado, checado no service
citizenVaccinationRecordRoutes.get(
  '/:id/vaccination-records',
  ensureAuthenticated,
  vaccinationRecordController.citizenCard,
);
