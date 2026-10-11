# VACINEI!? — Backend (TCC CESMAC)

API REST da plataforma VACINEI!?, caderneta de vacinação digital. Atende dois clientes: um app mobile (Expo) para cidadãos e um painel web para profissionais de saúde e gestores.
Domínios: autenticação/RBAC, usuários, dependentes, vacinas/doses, caderneta, UBSs com geolocalização, campanhas, relatórios e notificações push.
Pré-banca: **15/10/2026**. Priorize entregas demonstráveis.

**Stack:** Node 20+, TypeScript, Express 5, PostgreSQL (Docker) + Prisma 6, Zod 4, JWT + refresh token opaco no banco, bcryptjs. Previsto: Nodemailer (Ethereal), mock de SMS, FCM e OCR em Python (OpenCV + Tesseract).
Scripts: `npm run dev` (tsx watch), `npm run build` (tsc), `npx prisma db seed`.

## Contexto
- Regras completas em `agent.md`. Status, decisões e roadmap em `memory.md`. Leia o `memory.md` só quando precisar de status ou histórico, e atualize-o ao concluir um módulo ou tomar uma decisão de arquitetura.
- Antes de mudar qualquer regra de negócio, consulte `docs/DECISOES.md` (e registre lá novas decisões).
- Módulos em `src/modules/<modulo>/{controllers,dtos,services,repositories,routes}`. Controller só faz HTTP. Service tem 100% da regra de negócio (nunca usa req/res). Acesso ao banco via Prisma.
- Valide com Zod todo `body`/`query`/`params` antes do service. Erros com `throw new AppError(msg, status)`, tratados no errorHandler global.
- Perfis: `CIDADAO`, `PROFISSIONAL_SAUDE`, `ADMIN` (`ensureAuthenticated` + `checkRole`).
- Segurança/LGPD: nunca retornar senha ou campos sensíveis. Erros de login genéricos para não permitir enumeração de contas. Datas em ISO 8601.
- Auth: access token de 15 min. Refresh token de 30 dias, opaco e com rotação. Reset de senha: código de 6 dígitos válido por 10 min; 3 tentativas erradas bloqueiam por 15 min; reset bem-sucedido revoga todos os refresh tokens.

## Git
- Trabalhe e faça commits **sempre na branch `dev`**. **Nunca** commite, faça merge ou dê push na `main`.
- Commits seguem Conventional Commits em pt-BR. Veja a skill em `.claude/skills/git_commit`.
- PR de `dev` para `main` **só quando o usuário pedir**.
- Faça stage dos arquivos explicitamente. Nunca versione `.env` nem credenciais locais (por exemplo, usuário/senha do banco no `.env.example`).

## Economia de tokens
- **Nunca** leia `node_modules/`, `dist/`, `package-lock.json` ou `.env`.
- Leia só o necessário (trechos e grep em vez de arquivos inteiros).
