import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { VaccineController } from '../controllers/VaccineController';
import { ensureAuthenticated } from '../../../middlewares/ensureAuthenticated';
import { checkRole } from '../../../middlewares/checkRole';

export const vaccineRoutes = Router();
const vaccineController = new VaccineController();

// Consulta pública de vacinas e doses do Calendário SUS
vaccineRoutes.get('/', vaccineController.index);
vaccineRoutes.get('/:id', vaccineController.show);

// Gestão de vacinas restrita a ADMIN (RF008)
vaccineRoutes.post(
  '/',
  ensureAuthenticated,
  checkRole(UserRole.ADMIN),
  vaccineController.create,
);

vaccineRoutes.put(
  '/:id',
  ensureAuthenticated,
  checkRole(UserRole.ADMIN),
  vaccineController.update,
);

vaccineRoutes.delete(
  '/:id',
  ensureAuthenticated,
  checkRole(UserRole.ADMIN),
  vaccineController.delete,
);
