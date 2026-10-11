import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { ProfessionalController } from '../controllers/ProfessionalController';
import { ensureAuthenticated } from '../../../middlewares/ensureAuthenticated';
import { checkRole } from '../../../middlewares/checkRole';

export const professionalRoutes = Router();
const professionalController = new ProfessionalController();

// Verificação manual de profissionais de saúde (RS001): restrita a ADMIN
professionalRoutes.use(ensureAuthenticated, checkRole(UserRole.ADMIN));

professionalRoutes.get('/', professionalController.index);
professionalRoutes.patch('/:id/verify', professionalController.verify);
professionalRoutes.patch('/:id/reject', professionalController.reject);
