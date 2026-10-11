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

// Gestão de postos de saúde restrita a ADMIN (RF008)
ubsRoutes.post(
  '/',
  ensureAuthenticated,
  checkRole(UserRole.ADMIN),
  ubsController.create,
);

ubsRoutes.put(
  '/:id',
  ensureAuthenticated,
  checkRole(UserRole.ADMIN),
  ubsController.update,
);

ubsRoutes.delete(
  '/:id',
  ensureAuthenticated,
  checkRole(UserRole.ADMIN),
  ubsController.delete,
);
