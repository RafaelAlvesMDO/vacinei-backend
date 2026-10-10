import { Router } from 'express';
import { DashboardController } from '../controllers/DashboardController';
import { ensureAuthenticated } from '../../../middlewares/ensureAuthenticated';
import { ensureVerifiedProfessional } from '../../../middlewares/ensureVerifiedProfessional';

export const dashboardRoutes = Router();
const dashboardController = new DashboardController();

// Painel do profissional (RF009): restrito a profissional com registro verificado (RS005)
dashboardRoutes.use(ensureAuthenticated, ensureVerifiedProfessional);

dashboardRoutes.get('/summary', dashboardController.summary);
dashboardRoutes.get('/recent-doses', dashboardController.recentDoses);
dashboardRoutes.get('/monthly', dashboardController.monthly);
