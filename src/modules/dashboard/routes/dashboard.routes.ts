import { Router } from 'express';
import { DashboardController } from '../controllers/DashboardController';
import { ensureAuthenticated } from '../../../middlewares/ensureAuthenticated';
import { ensureVerifiedProfessional } from '../../../middlewares/ensureVerifiedProfessional';
import { ensureAdminOrVerifiedProfessional } from '../../../middlewares/ensureAdminOrVerifiedProfessional';

export const dashboardRoutes = Router();
const dashboardController = new DashboardController();

// Painel do profissional (RF009)
dashboardRoutes.use(ensureAuthenticated);

// Dados agregados: ADMIN ou profissional verificado (LGPD: princípio da necessidade)
dashboardRoutes.get('/summary', ensureAdminOrVerifiedProfessional, dashboardController.summary);
dashboardRoutes.get('/monthly', ensureAdminOrVerifiedProfessional, dashboardController.monthly);

// Identifica cidadãos com dados de saúde: só profissional verificado (RS005)
dashboardRoutes.get('/recent-doses', ensureVerifiedProfessional, dashboardController.recentDoses);
// Busca ativa de faltosos (D21)
dashboardRoutes.get('/overdue', ensureVerifiedProfessional, dashboardController.overdue);
