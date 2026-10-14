import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { ensureAuthenticated } from '../../../middlewares/ensureAuthenticated';

export const authRoutes = Router();
const authController = new AuthController();

authRoutes.post('/login', authController.login);
authRoutes.post('/refresh', authController.refresh);
authRoutes.post('/forgot-password', authController.forgotPassword);
authRoutes.post('/reset-password', authController.resetPassword);
authRoutes.get('/me', ensureAuthenticated, authController.me);
authRoutes.patch('/me', ensureAuthenticated, authController.updateProfile);
authRoutes.patch('/me/password', ensureAuthenticated, authController.changePassword);
