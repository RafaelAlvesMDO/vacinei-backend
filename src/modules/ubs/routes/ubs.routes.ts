import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { UbsController } from '../controllers/UbsController';
import { ensureAuthenticated } from '../../../middlewares/ensureAuthenticated';
import { checkRole } from '../../../middlewares/checkRole';
import { optionalAuthenticated } from '../../../middlewares/optionalAuthenticated';

export const ubsRoutes = Router();
const ubsController = new UbsController();

// Consulta pública de UBSs ativas e geolocalização; token de ADMIN libera includeInactive
ubsRoutes.get('/', optionalAuthenticated, ubsController.index);
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

// UBS nunca é excluída: só ativada/desativada, preservando o histórico (D10)
ubsRoutes.patch(
  '/:id/status',
  ensureAuthenticated,
  checkRole(UserRole.ADMIN),
  ubsController.updateStatus,
);
