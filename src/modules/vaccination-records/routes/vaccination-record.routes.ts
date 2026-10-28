import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { VaccinationRecordController } from '../controllers/VaccinationRecordController';
import { ensureAuthenticated } from '../../../middlewares/ensureAuthenticated';
import { ensureVerifiedProfessional } from '../../../middlewares/ensureVerifiedProfessional';
import { checkRole } from '../../../middlewares/checkRole';

export const vaccinationRecordRoutes = Router();
export const citizenVaccinationRecordRoutes = Router();
const vaccinationRecordController = new VaccinationRecordController();

// Cadastro manual na própria caderneta (RF005 / D30); o titular vem do token
const ensureCitizen = [ensureAuthenticated, checkRole(UserRole.CIDADAO, UserRole.PROFISSIONAL_SAUDE)];

vaccinationRecordRoutes.post('/', ...ensureCitizen, vaccinationRecordController.create);
vaccinationRecordRoutes.put('/:id', ...ensureCitizen, vaccinationRecordController.update);
vaccinationRecordRoutes.delete('/:id', ...ensureCitizen, vaccinationRecordController.delete);

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
