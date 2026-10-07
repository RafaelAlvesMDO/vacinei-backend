import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { ensureAuthenticated } from '../../../middlewares/ensureAuthenticated';

export const authRoutes = Router();
const authController = new AuthController();

authRoutes.post('/login', authController.login);
authRoutes.post('/refresh', authController.refresh);
authRoutes.get('/me', ensureAuthenticated, authController.me);
