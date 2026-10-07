import express from 'express';
import cors from 'cors';
import { routes } from './routes';
import { errorHandler } from './middlewares/errorHandler';

const app = express();

// Middlewares essenciais
app.use(cors());
app.use(express.json());

// Rotas da aplicação
app.use(routes);

// Middleware global de tratamento de erros (deve ser o último middleware)
app.use(errorHandler);

export { app };
