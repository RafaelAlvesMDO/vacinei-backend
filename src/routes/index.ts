import { Router } from 'express';
import { authRoutes } from '../modules/auth/routes/auth.routes';
import { userRoutes } from '../modules/users/routes/user.routes';
import { vaccineRoutes } from '../modules/vaccines/routes/vaccine.routes';
import { ubsRoutes } from '../modules/ubs/routes/ubs.routes';
import { citizenRoutes } from '../modules/users/routes/citizen.routes';
import {
  vaccinationRecordRoutes,
  citizenVaccinationRecordRoutes,
} from '../modules/vaccination-records/routes/vaccination-record.routes';
import { dashboardRoutes } from '../modules/dashboard/routes/dashboard.routes';
import { professionalRoutes } from '../modules/professionals/routes/professional.routes';

const routes = Router();

// Rota raiz com informações da API
routes.get('/', (_req, res) => {
  return res.json({
    name: 'VACINEI!? API',
    version: '1.0.0',
    description: 'API do sistema de caderneta de vacinação inteligente (TCC CESMAC)',
    status: 'online',
  });
});

// Health check para monitoramento
routes.get('/health', (_req, res) => {
  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Módulos da Aplicação
routes.use('/auth', authRoutes);
routes.use('/users', userRoutes);
routes.use('/vaccines', vaccineRoutes);
routes.use('/ubs', ubsRoutes);
routes.use('/citizens', citizenRoutes);
routes.use('/citizens', citizenVaccinationRecordRoutes);
routes.use('/vaccination-records', vaccinationRecordRoutes);
routes.use('/dashboard', dashboardRoutes);
routes.use('/professionals', professionalRoutes);

export { routes };
