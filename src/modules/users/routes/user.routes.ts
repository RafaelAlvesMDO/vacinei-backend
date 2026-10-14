import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { UserController } from '../controllers/UserController';
import { ensureAuthenticated } from '../../../middlewares/ensureAuthenticated';
import { checkRole } from '../../../middlewares/checkRole';
import { optionalAuthenticated } from '../../../middlewares/optionalAuthenticated';

export const userRoutes = Router();
const userController = new UserController();

// Cadastro público (Sign-up); com token de ADMIN também permite criar administradores
userRoutes.post('/', optionalAuthenticated, userController.create);

// Rotas autenticadas do usuário logado
// A edição do próprio perfil fica só no PATCH /auth/me (D20)
userRoutes.get('/me', ensureAuthenticated, userController.show);
userRoutes.delete('/me', ensureAuthenticated, userController.delete);

// Rotas administrativas / gerenciamento
userRoutes.get('/', ensureAuthenticated, checkRole(UserRole.ADMIN), userController.index);
userRoutes.get('/:id', ensureAuthenticated, userController.show);
userRoutes.put('/:id', ensureAuthenticated, checkRole(UserRole.ADMIN), userController.update);
userRoutes.delete('/:id', ensureAuthenticated, userController.delete);
