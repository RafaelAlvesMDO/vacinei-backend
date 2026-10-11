import { Router } from 'express';
import { CitizenController } from '../controllers/CitizenController';
import { ensureAuthenticated } from '../../../middlewares/ensureAuthenticated';
import { ensureVerifiedProfessional } from '../../../middlewares/ensureVerifiedProfessional';

export const citizenRoutes = Router();
const citizenController = new CitizenController();

// Busca de cidadão por nome, sem diferenciar acentos/maiúsculas (atendimento presencial)
citizenRoutes.get('/', ensureAuthenticated, ensureVerifiedProfessional, citizenController.index);
