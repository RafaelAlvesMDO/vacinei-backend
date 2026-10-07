import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { UbsController } from '../controllers/UbsController';
import { ensureAuthenticated } from '../../../middlewares/ensureAuthenticated';
import { checkRole } from '../../../middlewares/checkRole';

export const ubsRoutes = Router();
const ubsController = new UbsController();

// Consulta pública de UBSs e geolocalização por proximidade
ubsRoutes.get('/', ubsController.index);
ubsRoutes.get('/:id', ubsController.show);

// Gestão de postos de saúde (ADMIN e Profissional de Saúde)
ubsRoutes.post(
  '/',
  ensureAuthenticated,
  checkRole(UserRole.ADMIN, UserRole.PROFISSIONAL_SAUDE),
  ubsController.create,
);

ubsRoutes.put(
  '/:id',
  ensureAuthenticated,
  checkRole(UserRole.ADMIN, UserRole.PROFISSIONAL_SAUDE),
  ubsController.update,
);

ubsRoutes.delete(
  '/:id',
  ensureAuthenticated,
  checkRole(UserRole.ADMIN),
  ubsController.delete,
);
