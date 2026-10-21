import 'dotenv/config';
import { app } from './app';

const PORT = Number(process.env.PORT) || 3333;
// 0.0.0.0 para o app mobile acessar a API pelo IP do computador na rede local
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`🚀 Servidor VACINEI!? rodando na porta ${PORT}`);
  console.log(`📡 Healthcheck disponível em http://localhost:${PORT}/health`);
});