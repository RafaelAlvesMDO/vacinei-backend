# VACINEI!? — Backend

API REST da plataforma VACINEI!? (caderneta de vacinação digital). Node.js + Express 5 + TypeScript, PostgreSQL 15 com Prisma e microsserviço de OCR em Python (`ocr-service`).

## Requisitos

- Node.js 20.19 ou superior e npm
- Docker e Docker Compose

## Como rodar

1. Copie o arquivo de ambiente e ajuste os valores:

   ```bash
   cp .env.example .env
   ```

   - `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB` são lidos pelo `docker-compose.yml` para criar o banco. Escolha uma senha própria.
   - `DATABASE_URL` precisa usar **os mesmos** usuário, senha e banco (o dotenv não expande `${...}`, então os valores são repetidos).
   - `JWT_SECRET` é obrigatório. SMTP é opcional: sem ele, o código de recuperação de senha aparece no console.

2. Suba o banco e o serviço de OCR:

   ```bash
   docker compose up -d db ocr-api
   ```

   As credenciais do Postgres só valem na **primeira** criação do volume `pgdata`. Se o volume já existe com outras credenciais, mantenha as antigas no `.env` ou recrie o volume com `docker compose down -v` (apaga os dados).

3. Prepare o banco e inicie a API:

   ```bash
   npm install
   npx prisma generate
   npx prisma migrate deploy
   npx prisma db seed
   npm run dev
   ```

   A API escuta em `http://0.0.0.0:3333` (acessível pelo IP do computador na rede local, para o app mobile).

## Portas

| Serviço | Porta |
|---|---|
| API | 3333 |
| PostgreSQL | 5432 |
| OCR (FastAPI) | 8000 |

## Documentação

- Contrato da API: `docs/API.md`
- Decisões de arquitetura e regras de negócio: `docs/DECISOES.md`
