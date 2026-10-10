# Memória Contínua do Projeto - VACINEI!? Backend

Este documento registra o status atual, decisões de arquitetura e próximos passos do desenvolvimento do backend da plataforma **VACINEI!?** (TCC CESMAC). Ele deve ser consultado no início de cada sessão ou tarefa e atualizado a cada entrega ou decisão relevante.

---

## 1. Status Atual da Fase do Projeto

- **Fase Atual:** Fase 2 - CRUDs Essenciais e Autenticação (Foco Pré-Banca: 15 de Outubro de 2026)
- **Status:** 
  - **Script de Seeds (`prisma/seed.ts`) implementado e executado com sucesso:** 12 vacinas do SUS com esquema completo de doses, 36 UBSs reais de Maceió/AL com georreferenciamento cobrindo os 8 Distritos Sanitários (com CNES, logradouro, bairro, CEP, telefone, horário e coordenadas exatas) e usuários de teste (Admin, Profissional de Saúde e Cidadão com dependentes).
  - **Infraestrutura de Autenticação e Segurança ativa:** `bcryptjs` para hash de senhas, `jsonwebtoken` para access tokens (15m), refresh tokens opacos (30 dias) persistidos no PostgreSQL, middlewares `ensureAuthenticated` e `checkRole` (RBAC).
  - **CRUD de Contas/Usuários (`src/modules/users`):** Cadastro público (Cidadão e Profissional de Saúde com validação de conselho), consulta de perfil (`/users/me`), busca por ID, listagem paginada (ADMIN), atualização e desativação lógica.
  - **CRUD de Vacinas (`src/modules/vaccines`):** Listagem com busca textual e público-alvo, detalhes por ID com doses ordenadas, criação, atualização e desativação segura protegidas por RBAC.
  - **CRUD de Unidades Básicas de Saúde (`src/modules/ubs`):** Listagem com cálculo geográfico de proximidade por coordenadas (Haversine validado com 36 UBSs), filtro por raio (km), busca por texto/bairro/cidade, detalhes por ID e gestão de UBSs.
- **Data da Última Atualização:** 2026-10-07

---

## 2. Histórico de Decisões de Arquitetura

1. **Stack Base & Persistência:**
   - **Node.js (v20+) + TypeScript + Express 5:** Plataforma com tipagem estática e suporte nativo assíncrono.
   - **PostgreSQL + Prisma ORM (v6.19.3):** Integridade referencial estrita, migrations automatizadas e cliente tipado.

2. **Arquitetura Multi-Cliente (Mobile + Painel Web):**
   - API RESTful agnóstica para alimentar simultaneamente:
     - **Aplicativo Mobile (Expo / React Native):** Cidadãos (caderneta digital, dependentes, alertas e proximidade de UBSs).
     - **Painel Web Administrativo:** Gestores e profissionais de saúde (gestão de UBSs, relatórios e campanhas).

3. **Autenticação, Sessão e Perfis (RBAC):**
   - **JWT (Access Token) + Refresh Tokens:** Tokens de acesso de 15 min e refresh tokens opacos com rotação persistidos na tabela `refresh_tokens`.
   - **Perfis de Acesso:** `CIDADAO`, `PROFISSIONAL_SAUDE` e `ADMIN`.
   - **Validação de Registro Profissional (RS001):** Tabela `professional_registries` com unicidade composta `[council, registryNumber, uf]`.
   - **Recuperação de Senha (2026-10-10):** Código de 6 dígitos (`crypto.randomInt`) salvo apenas como hash SHA-256, validade de 10 min; novo pedido invalida códigos anteriores. 3 erros bloqueiam por 15 min via `blockedUntil` e invalidam o código; durante o bloqueio, `forgot-password` não gera novo código (evita burlar o bloqueio). Reset bem-sucedido troca a senha e revoga todos os refresh tokens em transação. `forgot-password` sempre retorna a mesma resposta (anti-enumeração).
   - **MailProvider (`src/providers/MailProvider`):** Nodemailer configurado por `SMTP_*`/`MAIL_FROM`; sem SMTP configurado, o e-mail é exibido no console (modo de teste local).

4. **Geolocalização (UBSs):**
   - Cálculo de distâncias em quilômetros via fórmula matemática de Haversine (`src/utils/distance.ts`) na camada de serviço, ordenando postos de saúde da mais próxima à mais distante.

5. **Integridade de Dados e Soft Deletes:**
   - Vacinas com histórico vacinal e UBSs com registros vinculados recebem desativação lógica (`isActive: false`), impedindo corrupção do histórico epidemiológico.

6. **Padronização de Versionamento e Commits (Skill `git_commit`):**
   - Adoção estrita da convenção Conventional Commits (`tipo(escopo): descrição concisa`) com mensagens em português do Brasil.
   - Tipos permitidos: `feat`, `fix`, `docs`, `style`, `refactor`.
   - Fluxo padronizado via skill (`.claude/skills/git_commit`): trabalho e commits sempre na branch `dev` -> `git push origin dev`. Nunca commitar/mergear/push na `main`; PR `dev` -> `main` só a pedido do autor (decisão de 2026-10-10).

---

## 3. Entidades Modeladas no Prisma (`prisma/schema.prisma`)

- `User`: Usuários do sistema (cidadãos, profissionais e admins) com hash de senha, CPF único e controle ativo.
- `ProfessionalRegistry`: Dados do conselho de classe (CRM, COREN, etc.) vinculados 1:1 ao profissional de saúde.
- `RefreshToken`: Tokens de atualização para ciclo de autenticação seguro.
- `PasswordResetCode`: Códigos de redefinição de senha (hash) com controle de expiração, tentativas e bloqueio (`blockedUntil`, migration `20261010220933_add_blocked_until_to_password_reset_code`).
- `Dependent`: Dependentes vinculados a um responsável, com unicidade `[name, birthDate]` (RS008).
- `Vaccine` e `Dose`: Catálogo do Calendário Nacional de Vacinação (doenças-alvo, faixas etárias e intervalos).
- `VaccinationRecord`: Histórico e caderneta de vacinas do cidadão/dependente, rastreabilidade do profissional aplicador (`appliedById` - RS006/RF010), UBS de aplicação e status vacinal.
- `Ubs`: Unidades Básicas de Saúde com coordenadas geográficas (latitude/longitude) e CNES.
- `Campaign`, `CampaignVaccine`, `CampaignUbs`: Campanhas de vacinação, vacinas em destaque e UBSs participantes.
- `DeviceToken` e `Notification`: Gestão de dispositivos FCM multi-plataforma e histórico de mensagens.

---

## 4. Estrutura de Rotas e Endpoints Implementados

### 4.1. Autenticação (`/auth`)
- `POST /auth/login`: Autentica usuário com e-mail/senha, retornando access token JWT e refresh token.
- `POST /auth/refresh`: Realiza a rotação do refresh token e emite novo access token.
- `GET /auth/me`: Retorna perfil completo e dependentes do usuário autenticado.
- `POST /auth/forgot-password`: Gera e envia por e-mail código de recuperação (resposta sempre genérica).
- `POST /auth/reset-password`: Valida código (3 tentativas, bloqueio de 15 min), redefine a senha e revoga sessões.

### 4.2. Usuários / Contas (`/users`)
- `POST /users`: Cadastro de cidadão ou profissional de saúde (com CRM/COREN).
- `GET /users/me`: Perfil do próprio usuário logado.
- `PUT /users/me`: Atualização cadastral do próprio usuário.
- `DELETE /users/me`: Desativação da própria conta com revogação de sessões ativas.
- `GET /users`: Listagem paginada e filtrada de usuários (restrito a `ADMIN`).
- `GET /users/:id`: Consulta de usuário por ID (`ADMIN` ou próprio usuário).
- `PUT /users/:id`: Edição de usuário por ID (`ADMIN` ou próprio usuário).
- `DELETE /users/:id`: Desativação de conta (`ADMIN` ou próprio usuário).

### 4.3. Vacinas e Doses (`/vaccines`)
- `GET /vaccines`: Consulta pública de vacinas do Calendário SUS com suas doses (filtros: `targetAudience`, `search`).
- `GET /vaccines/:id`: Detalhes de uma vacina específica com doses ordenadas.
- `POST /vaccines`: Cadastro de nova vacina e doses (`ADMIN`, `PROFISSIONAL_SAUDE`).
- `PUT /vaccines/:id`: Atualização de informações de vacina (`ADMIN`, `PROFISSIONAL_SAUDE`).
- `DELETE /vaccines/:id`: Remoção/desativação de vacina (`ADMIN`).

### 4.4. Unidades Básicas de Saúde (`/ubs`)
- `GET /ubs`: Listagem de UBSs com suporte a filtros (`city`, `state`, `search`) e cálculo de proximidade (`latitude`, `longitude`, `radiusKm`).
- `GET /ubs/:id`: Detalhes de uma UBS com contagem de atendimentos e campanhas.
- `POST /ubs`: Cadastro de UBS (`ADMIN`, `PROFISSIONAL_SAUDE`).
- `PUT /ubs/:id`: Edição de UBS (`ADMIN`, `PROFISSIONAL_SAUDE`).
- `DELETE /ubs/:id`: Remoção/desativação de UBS (`ADMIN`).

---

## 5. Roteiro para Apresentação da Pré-Banca (Até 15/Outubro/2026)

- [x] **Setup do Banco e Migrations:** PostgreSQL ativo via Docker e migration inicial aplicada (`20261001031748_init`).
- [x] **Script de Seeds (`prisma/seed.ts`):** 12 vacinas do SUS, 5 UBSs de Maceió e 3 perfis de usuários cadastrados.
- [x] **Infraestrutura de Autenticação e Segurança:** JWT, Refresh Tokens, senhas com bcrypt e middlewares RBAC.
- [x] **Recuperação de Senha:** `forgot-password`/`reset-password` com código por e-mail (Nodemailer ou console), tentativas e bloqueio.
- [x] **CRUD de Contas/Utilizadores:** Cadastro público, autenticação, perfis e gerenciamento.
- [x] **CRUD de Vacinas:** Consulta do catálogo SUS com doses e gestão por profissionais/admins.
- [x] **CRUD de Unidades Básicas de Saúde (UBSs):** Consulta, cadastro e cálculo geográfico por proximidade.
- [ ] **Módulo de Dependentes (`src/modules/dependents`):** Cadastro e listagem de dependentes (filhos/tutelados) vinculados ao responsável (RS008).
- [ ] **Módulo de Caderneta e Registro de Aplicações (`src/modules/vaccination-records`):** Registro de aplicação presencial por profissional (RS006/RF010) e cálculo dos status da caderneta (`EM_DIA`, `ATRASADA`, `COMPLETA`).
- [ ] **Coleção de Requisições / Documentação de Teste:** Criar documentação clara de chamadas HTTP (Insomnia/Postman/cURL) para demonstrar na banca.
