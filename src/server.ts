import 'dotenv/config';
import { app } from './app';

const PORT = Number(process.env.PORT) || 3333;

app.listen(PORT, () => {
  console.log(`🚀 Servidor VACINEI!? rodando na porta ${PORT}`);
  console.log(`📡 Healthcheck disponível em http://localhost:${PORT}/health`);
});