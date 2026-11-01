import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { DependentController } from '../controllers/DependentController';
import { ensureAuthenticated } from '../../../middlewares/ensureAuthenticated';
import { checkRole } from '../../../middlewares/checkRole';

export const dependentRoutes = Router();
const dependentController = new DependentController();

// Dependentes do usuário logado (RF012 / RS004 / D33); o profissional também é responsável (D11)
dependentRoutes.use(ensureAuthenticated, checkRole(UserRole.CIDADAO, UserRole.PROFISSIONAL_SAUDE));

dependentRoutes.get('/', dependentController.index);
dependentRoutes.post('/', dependentController.create);
dependentRoutes.get('/:id', dependentController.show);
dependentRoutes.put('/:id', dependentController.update);
dependentRoutes.delete('/:id', dependentController.delete);

// Caderneta e registro manual do dependente: mesmas regras do titular (D30 / D32)
dependentRoutes.get('/:id/vaccination-records', dependentController.card);
dependentRoutes.post('/:id/vaccination-records', dependentController.createRecord);
dependentRoutes.put('/:id/vaccination-records/:recordId', dependentController.updateRecord);
dependentRoutes.delete('/:id/vaccination-records/:recordId', dependentController.deleteRecord);
