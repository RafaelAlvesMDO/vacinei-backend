# Memória Contínua do Projeto - VACINEI!? Backend

Este documento registra o status atual, decisões de arquitetura e próximos passos do desenvolvimento do backend da plataforma **VACINEI!?** (TCC CESMAC). Ele deve ser consultado no início de cada sessão ou tarefa e atualizado a cada entrega ou decisão relevante.

---

## 1. Status Atual da Fase do Projeto

- **Fase Atual:** Fase 2 - CRUDs Essenciais e Autenticação (Foco Pré-Banca: 15 de Outubro de 2026)
- **Status:** 
  - **Script de Seeds (`prisma/seed.ts`) implementado e executado com sucesso:** 20 vacinas do SUS com esquema completo de doses e aliases (8 acrescentadas para o OCR, D34), 34 UBSs reais de Maceió/AL com georreferenciamento cobrindo os 8 Distritos Sanitários (CNES, logradouro, bairro, CEP, telefone e coordenadas conferidos com o CNES/DATASUS 2026.09; 4 coordenadas erradas no próprio CNES conferidas manualmente no Google Maps, ver D28) e usuários de teste (Admin, Profissional de Saúde e Cidadão com dependentes).
  - **Infraestrutura de Autenticação e Segurança ativa:** `bcryptjs` para hash de senhas, `jsonwebtoken` para access tokens (15m), refresh tokens opacos (30 dias) persistidos no PostgreSQL, middlewares `ensureAuthenticated` e `checkRole` (RBAC).
  - **CRUD de Contas/Usuários (`src/modules/users`):** Cadastro público (Cidadão e Profissional de Saúde com validação de conselho), consulta de perfil (`/users/me`), busca por ID, listagem paginada (ADMIN), atualização e desativação lógica.
  - **CRUD de Vacinas (`src/modules/vaccines`):** Listagem com busca textual e público-alvo, detalhes por ID com doses ordenadas, criação, atualização e desativação segura protegidas por RBAC.
  - **CRUD de Unidades Básicas de Saúde (`src/modules/ubs`):** Listagem com cálculo geográfico de proximidade por coordenadas (Haversine validado com 36 UBSs), filtro por raio (km), busca por texto/bairro/cidade, detalhes por ID e gestão de UBSs.
  - **Caderneta e Confirmação Presencial (`src/modules/vaccination-records`):** cálculo de status por vacina (`EM_DIA`/`ATRASADA`/`COMPLETA`), confirmação de dose por profissional verificado (RF010/RS006), caderneta do cidadão (RF006) e busca de cidadão sem acentos (`/citizens`) e cadastro manual pelo titular (RF005/RS003/RS004, D30), editável e excluível até a confirmação.
  - **Dependentes (`src/modules/dependents`, etapa 7, RF012/RS004/RS008, D33, 2026-11-01):** dependente é um `User` `CIDADAO` sem e-mail/senha ligado ao responsável (`responsibleId`, `onDelete: Restrict`), com `sex` e `relationship` opcionais. CRUD em `/dependents` e caderneta/registro manual em `/dependents/:id/vaccination-records` reaproveitando os serviços do titular. Menor de 18 no cadastro (exceto `CURATELADO`), 409 por CPF ou nome+nascimento no mesmo responsável, remoção só sem dose confirmada. Busca de cidadãos, confirmação, `/overdue`, `/recent-doses` e métricas incluem dependentes com o nome do responsável; RS006 bloqueia os dependentes do próprio profissional.
  - **Dashboard do Profissional (`src/modules/dashboard`, RF009/RS005):** resumo (cadernetas, vacinas registradas, doses atrasadas), últimas doses e série mensal de 12 meses, restritos a profissional verificado.
  - **Verificação de Profissionais (`src/modules/professionals`, RS001):** listagem por status, aprovação e recusa manual pelo ADMIN, com auditoria de quem decidiu e quando.
  - **Contrato da API:** `docs/API.md` com todos os endpoints, perfis de acesso, bodies, respostas, erros e logins do seed.
  - **Seed com dados de dashboard:** 25 cidadãos (`cidadao01..25@vacinei.com.br`), 142 registros nos últimos 12 meses com mistura de em dia, atrasados e completos; profissional não verificado `paulo.ribeiro@vacinei.com.br` para testar o 403. Senha de todos: `Vacinei@2026` (RF001).
  - **Prova de conceito do OCR (`ocr-service/`, RF004/D25):** container Python (OpenCV + pytesseract `por`) no perfil `ocr` do compose, ainda sem integração com API/app. Processa uma pasta de fotos (`OCR_SAMPLES_DIR`, somente leitura) e grava etapas e relatórios em `OCR_OUTPUT_DIR`, ambas fora do repo. Extrai data, lote e vacina (catálogo do seed + vacinas conhecidas fora dele, ex.: ACWY) e compara com `gabarito.txt`. Rodada 2 (2026-11-01) acrescentou a leitura por campo com âncoras (`ocr_formulario.py`): detecta blocos do cartão, usa os rótulos impressos como âncoras e lê cada faixa isolada. Na foto real (letra à mão): página inteira 0/2, âncoras 1/2. A vacina (ACWY) e o código (`V:OPIL…`) saem quase certos; a data e os dígitos manuscritos não são reconhecidos pelo Tesseract, nem com whitelist, nem com outra escala, nem com o modelo `eng` ou a leitura por caractere. Escopo a discutir: OCR sugere e o cidadão confirma (RF004).
  - **OCR integrado (etapa 8, RF004/RNF05/RNF12, D25/D34, 2026-11-04):**
    - **Serviço:** FastAPI `ocr-api` no compose (porta 8000), com OCR por **modelos de caderneta** (`ocr-service/templates/<modelo>/`: `reference*.png` em branco + `cells.json`). Modelos: `caderneta-crianca-ms` (2 páginas, 19+13 células) e `caderneta-maceio-jovens-adultos` (16 blocos impressos + 16 livres).
    - **Pipeline:** SIFT + RANSAC identifica a página e a homografia alinha a foto. Cada célula é reajustada localmente; a tinta à mão (escura, fora da impressão da referência, sem cor de mancha) separa vazias de preenchidas; o Tesseract lê data e lote (e a vacina nos blocos livres). Vacina e dose impressas vêm da posição.
    - **Backend (`POST /vaccination-records/ocr`):** multer em memória, `OcrProvider` com timeout de 20 s e conversão para `vaccineId`/`doseId` pelo nome e pelos `aliases` do catálogo. Não grava registros: o app salva pelas rotas manuais com `origin: OCR_ICR`. Erros com `code` para o app cair no cadastro manual.
    - **Medido na foto do cartão de Maceió:** modelo identificado (2494 inliers, alinhamento "boa"), só o bloco ACWY encontrado e zero falsos positivos nos blocos manchados. Data e lote manuscritos voltam vazios, com recorte: o Tesseract não reconhece escrita à mão. A vacina do bloco livre usa a leitura por âncoras da rodada 2 (`leitura_ancoras.py`) e é lida como "Acwy" → Meningocócica ACWY, mas só em algumas alturas de bloco (acerto frágil). A faixa do lote em Maceió inclui a linha do FAB.
    - **D35 (2026-11-04):** o alerta de atraso vale só para esquemas iniciados (D32 ajustada). Vacina nunca iniciada não gera alerta nem aparece na caderneta. A janela de idade por vacina (+34 atrasadas no seed) foi descartada antes do congelamento; avaliar o calendário do PNI por público fica como melhoria futura.
    - **Avaliação com fotos reais:** `avaliar_templates.py` (gabarito `X.txt` por imagem, com várias doses). A PoC antiga (`poc_ocr.py`, perfil `ocr`) continua funcionando.
- **Data da Última Atualização:** 2026-11-04

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
   - **Categoria profissional (2026-10-12, D12):** enum `ProfessionalCategory` em `professional_registries`; `council` derivado no backend (`src/utils/professionalCouncil.ts`). UF via campo `uf` ou sufixo `-UF` do número. Categorias (D13): MEDICO, ENFERMEIRO, TECNICO_ENFERMAGEM, AUXILIAR_ENFERMAGEM, FARMACEUTICO.
   - **CPF e data de nascimento (2026-10-12, D14):** obrigatórios no cadastro de todos os perfis. CPF validado pelos dígitos verificadores, salvo só com números (migration `normaliza_cpf_somente_digitos`), único e mascarado para terceiros (`src/utils/cpf.ts`). `birthDate` não pode ser futura. No banco as colunas seguem aceitando nulo.
   - **Profissional também é cidadão (2026-10-12, D11):** `CITIZEN_ROLES` (`src/utils/citizenRoles.ts`) = `CIDADAO` + `PROFISSIONAL_SAUDE` na busca, caderneta, confirmação e dashboard; autoconfirmação bloqueada (403, RS006).
   - **Recuperação de Senha (2026-10-10):** Código de 6 dígitos (`crypto.randomInt`) salvo apenas como hash SHA-256, validade de 10 min; novo pedido invalida códigos anteriores. 3 erros bloqueiam por 15 min via `blockedUntil` e invalidam o código; durante o bloqueio, `forgot-password` não gera novo código (evita burlar o bloqueio). Reset bem-sucedido troca a senha e revoga todos os refresh tokens em transação. `forgot-password` sempre retorna a mesma resposta (anti-enumeração).
   - **MailProvider (`src/providers/MailProvider`):** Nodemailer configurado por `SMTP_*`/`MAIL_FROM`; sem SMTP configurado, o e-mail é exibido no console (modo de teste local).

4. **Geolocalização (UBSs):**
   - Cálculo de distâncias em quilômetros via fórmula matemática de Haversine (`src/utils/distance.ts`) na camada de serviço, ordenando postos de saúde da mais próxima à mais distante.

5. **Integridade de Dados e Soft Deletes:**
   - Vacinas com histórico vacinal recebem desativação lógica (`isActive: false`), impedindo corrupção do histórico epidemiológico.
   - UBSs nunca são excluídas (2026-10-12, D10): `DELETE /ubs/:id` removido; ativação/desativação via `PATCH /ubs/:id/status`.

6. **Padronização de Versionamento e Commits (Skill `git_commit`):**
   - Adoção estrita da convenção Conventional Commits (`tipo(escopo): descrição concisa`) com mensagens em português do Brasil.
   - Tipos permitidos: `feat`, `fix`, `docs`, `style`, `refactor`.
   - Fluxo padronizado via skill (`.claude/skills/git_commit`): trabalho e commits sempre na branch `dev` -> `git push origin dev`. Nunca commitar/mergear/push na `main`; PR `dev` -> `main` só a pedido do autor (decisão de 2026-10-10).

7. **Motor de Status Vacinal (2026-10-10):**
   - Função pura `calculateVaccineStatus` (`vaccination-records/services/CalculateVaccineStatusService.ts`), sem acesso ao banco, para reuso pelo motor de alertas (RF007). Próxima dose = última aplicação + `intervalDaysFromPrevious`; sem intervalo, nascimento + `recommendedAgeMonths`. `ATRASADA` quando a data prevista já passou.
   - O status calculado (`EM_DIA`/`ATRASADA`/`COMPLETA`) não é persistido: é derivado por vacina a cada consulta. O campo `status` do registro só distingue `CONFIRMADO` (presencial) dos registros manuais/OCR.
   - A caderneta lista só vacinas com ao menos um registro (evita marcar adultos como atrasados em vacinas infantis).
   - **D32 (2026-10-28):** `calculateAlertStatus` separa `ATRASADA` (dose vencida sem nenhum registro) de `AGUARDANDO_CONFERENCIA` (doses informadas e não confirmadas, `pendingDoses`, sem dias de atraso). Usada pelo campo `alert` da caderneta (alertas do app, RF007 nota 7), pelo `/dashboard/overdue` (`?status=ATRASADA|AGUARDANDO_CONFERENCIA`, `counts` e `doseCounts`) e pelo `/dashboard/summary` (`totalDosesAguardandoConferencia`).
   - Acesso a profissional verificado via middleware `ensureVerifiedProfessional` (consulta `professionalRegistry.isVerified` no banco a cada requisição).
   - Busca sem acentos usa a extensão PostgreSQL `unaccent` (migration `20261010231422_enable_unaccent_extension`).

8. **Confirmação Presencial e Dashboard (2026-10-10):**
   - `VaccinationRecord.confirmedAt` (migration `20261010232527_add_confirmed_at_to_vaccination_record`) guarda a data da confirmação presencial. Confirmar um registro manual/OCR mantém a `applicationDate` original (se nula, recebe a data da confirmação); registros criados pelo profissional têm `applicationDate = confirmedAt = agora`.
   - O resumo do dashboard calcula os atrasos em lote com a função pura `calculateVaccineStatus` (uma query, em vez de chamar o service por par cidadão/vacina). `totalDosesAtrasadas` = pares cidadão/vacina com status `ATRASADA`.
   - A série mensal agrupa pela `applicationDate` no fuso `America/Maceio` via `generate_series` (meses sem registro retornam 0).
   - As métricas do dashboard incluem os dependentes desde a etapa 7 (D33).

9. **Senha Forte, Cadastro de ADMIN e Verificação de Profissionais (2026-10-10):**
   - Regra de senha do RF001 (mín. 8, maiúscula, minúscula, número e símbolo) centralizada em `src/utils/passwordSchema.ts`, aplicada em `POST /users` e `POST /auth/reset-password`. O login segue aceitando qualquer senha não vazia (contas antigas).
   - `POST /users` usa `optionalAuthenticated`: o cadastro público só cria `CIDADAO`/`PROFISSIONAL_SAUDE`; `ADMIN` exige token de ADMIN (403 caso contrário). O seed continua criando o admin direto no banco.
   - Profissional do cadastro público nasce com `isVerified = false` (antes era pré-verificado para demo) e é verificado manualmente em `/professionals`. Criado por ADMIN, já nasce verificado (`verifiedAt` = agora, `verifiedById` = admin).
   - Escrita (POST/PUT/DELETE) em `/vaccines` e `/ubs` restrita a ADMIN (seção 2.2, item 4 da 2.3 e RF008 nota 8). GETs seguem públicos.
   - `ProfessionalRegistry` ganhou `verifiedById`, `rejectedAt`, `rejectedById` e `rejectionReason` (migration `20261010234205_add_verification_audit_to_professional_registry`).
   - **Recusa mantém a conta ativa e não verificada:** o `ensureVerifiedProfessional` já bloqueia as ações clínicas e o profissional pode ser verificado depois. Recusar um profissional já verificado revoga a verificação. Bloqueio total fica a cargo de `DELETE /users/:id`.

10. **Dependentes como usuários sem credenciais (2026-11-01, D33):**
   - Migration `20261101201307_dependentes_como_usuarios`: `User.email`/`passwordHash` opcionais, `responsibleId` (autorrelação `UserDependents`, Restrict), enums `Sex` e `DependentRelationship`; removidos o model `Dependent` e `vaccination_records.dependent_id` (só tinham dados do seed).
   - Acesso centralizado: `findOwnDependent` (404 se não for dependente do usuário) e `ensureCanManageCard` nos serviços de registro manual, que recebem `subjectId` opcional; `GetCitizenVaccinationCardService` aceita titular, responsável ou profissional verificado.
   - `/users` (admin) ignora dependentes (`responsibleId: null`).
   - `prisma migrate dev` recusa rodar em terminal não interativo quando há aviso de perda de dados; nesta etapa a tabela `dependents` (só seed) foi esvaziada antes para a migration rodar sem prompt.
   - Seed: `cidadao02` (João Pedro) passou de bebê para adulto para ser responsável; dependentes para cidadao01 (3), cidadao02 (2) e Carlos (2).
11. **OCR por modelos de caderneta (2026-11-04, D34):**
   - Migration `20261104200438_vacinas_aliases`: `Vaccine.aliases String[]` (siglas e nomes populares para o match do OCR).
   - Seed: 8 vacinas novas (Meningocócica ACWY, COVID-19, Dupla Adulto (dT), DTP, Tetra Viral, Varicela, Hepatite A e Pneumocócica 23V), 20 no total. COVID-19 e Pneumo 23V ficam sem idade e sem intervalo, fora do cálculo de atraso como a dTpa.
   - Contagens do dashboard iguais antes e depois (23 atrasadas em 11 pessoas, 77 aguardando conferência em 30 pessoas), porque o atraso só é calculado para vacinas com registro.
   - Doses impressas sem correspondente no catálogo voltam com `doseId: null` (Hep B do adulto, HPV 2ª dose). FA "Dose única" → 1ª Dose; VOP 1º/2º reforço → VIP doses 4 e 5.
   - `AppError` ganhou `code` opcional, devolvido pelo `errorHandler`, que também trata `MulterError` (413/400).
   - O `.gitignore` libera só `ocr-service/templates/*/reference*.png`. A referência de Maceió foi gerada da foto com o bloco preenchido apagado (`templates_tool.py referencia-maceio`).

---

## 3. Entidades Modeladas no Prisma (`prisma/schema.prisma`)

- `User`: Usuários do sistema (cidadãos, profissionais e admins) com hash de senha, CPF único e controle ativo.
- `ProfessionalRegistry`: Dados do conselho de classe (CRM, COREN, etc.) vinculados 1:1 ao profissional de saúde.
- `RefreshToken`: Tokens de atualização para ciclo de autenticação seguro.
- `PasswordResetCode`: Códigos de redefinição de senha (hash) com controle de expiração, tentativas e bloqueio (`blockedUntil`, migration `20261010220933_add_blocked_until_to_password_reset_code`).
- Dependentes (D33): registros de `User` com `responsibleId`, sem e-mail/senha, com `sex` e `relationship`. Unicidade (RS008) validada no service.
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
- `POST /users`: Cadastro de cidadão ou profissional de saúde conforme RF001 (nome com 2+ palavras até 120, celular com 11 dígitos, e-mail até 100, CPF válido e único, data de nascimento não futura; profissional com `category` + `registryNumber`; pendente no cadastro público, verificado se criado por ADMIN). `ADMIN` só com token de ADMIN.
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
- `POST /vaccines`: Cadastro de nova vacina e doses (`ADMIN`).
- `PUT /vaccines/:id`: Atualização de informações de vacina (`ADMIN`).
- `DELETE /vaccines/:id`: Remoção/desativação de vacina (`ADMIN`).

### 4.4. Unidades Básicas de Saúde (`/ubs`)
- `GET /ubs`: Listagem de UBSs ativas com filtros (`city`, `state`, `search`) e proximidade (`latitude`, `longitude`, `radiusKm`); `includeInactive=true` só para `ADMIN`.
- `GET /ubs/:id`: Detalhes de uma UBS com contagem de atendimentos e campanhas.
- `POST /ubs`: Cadastro de UBS com campos do RF008 (CEP, logradouro, `number`, bairro, horário obrigatórios) (`ADMIN`).
- `PUT /ubs/:id`: Edição de UBS (`ADMIN`).
- `PATCH /ubs/:id/status`: Ativa/desativa UBS (`ADMIN`); não há exclusão.

### 4.5. Caderneta e Confirmação Presencial (`/vaccination-records`, `/citizens`)
- `POST /vaccination-records`: Cadastro manual na própria caderneta (`CIDADAO`/`PROFISSIONAL_SAUDE`, titular do token). Origem `MANUAL`, `status` `EM_DIA` = aguardando confirmação (D30); 409 se a dose já existir.
- `POST /vaccination-records/ocr`: Leitura da caderneta por foto (multipart `image`). Devolve sugestões de doses com recortes, sem gravar (RF004/D34). O salvamento usa o cadastro manual com `origin: OCR_ICR` e `ocrConfidence` opcionais.
- `PUT` / `DELETE /vaccination-records/:id`: Edição/exclusão pelo titular só enquanto não `CONFIRMADO` (403 se confirmado ou de terceiro).
- `POST /vaccination-records/confirm`: Confirmação presencial de dose (profissional verificado). `confirmedAt` = agora, profissional = sessão; registro existente mantém a `applicationDate` original. Cria registro `SISTEMA_PRESENCIAL`/`CONFIRMADO` ou promove registro manual/OCR existente a `CONFIRMADO` (RF007 nota 7); 409 se já confirmado.
- `GET /citizens?search=`: Busca de cidadão por CPF exato (termo com 11 dígitos, com ou sem máscara) ou por nome via `unaccent` + `ILIKE` (profissional verificado), CPF mascarado, até 20 resultados.
- `GET /citizens/:id/vaccination-records`: Caderneta agrupada por vacina com status calculado (titular, responsável ou profissional verificado).

### 4.5.1. Dependentes (`/dependents`, CIDADAO/PROFISSIONAL_SAUDE)
- `GET` / `POST /dependents`, `GET` / `PUT` / `DELETE /dependents/:id`: CRUD dos dependentes do usuário logado (D33).
- `GET` / `POST /dependents/:id/vaccination-records`, `PUT` / `DELETE /dependents/:id/vaccination-records/:recordId`: caderneta e registro manual do dependente, mesmas regras do titular.

### 4.6. Dashboard do Profissional (`/dashboard`, profissional verificado)
- `GET /dashboard/summary`: `totalCadernetas`, `totalVacinasRegistradas` e `totalDosesAtrasadas`.
- `GET /dashboard/recent-doses?limit=10`: Últimas doses (1 a 50) com cidadão, vacina, dose, data e status do registro.
- `GET /dashboard/monthly`: Vacinas aplicadas por mês nos últimos 12 meses, incluindo meses com zero.

### 4.7. Verificação de Profissionais (`/professionals`, ADMIN)
- `GET /professionals?verified=false`: Profissionais com nome, e-mail, categoria (conselho), registro, data de cadastro e `verificationStatus` (`PENDENTE`/`VERIFICADO`/`RECUSADO`).
- `PATCH /professionals/:id/verify`: Verifica o registro, gravando `verifiedAt` e `verifiedBy`; 409 se já verificado.
- `PATCH /professionals/:id/reject`: Recusa com `reason` opcional; a conta segue ativa e não verificada; 409 se já recusado.

Contrato completo de todos os endpoints: `docs/API.md`.

---

## 5. Roteiro para Apresentação da Pré-Banca (Até 15/Outubro/2026)

- [x] **Setup do Banco e Migrations:** PostgreSQL ativo via Docker e migration inicial aplicada (`20261001031748_init`).
- [x] **Script de Seeds (`prisma/seed.ts`):** 12 vacinas do SUS, 5 UBSs de Maceió e 3 perfis de usuários cadastrados.
- [x] **Infraestrutura de Autenticação e Segurança:** JWT, Refresh Tokens, senhas com bcrypt e middlewares RBAC.
- [x] **Recuperação de Senha:** `forgot-password`/`reset-password` com código por e-mail (Nodemailer ou console), tentativas e bloqueio.
- [x] **CRUD de Contas/Utilizadores:** Cadastro público, autenticação, perfis e gerenciamento.
- [x] **CRUD de Vacinas:** Consulta do catálogo SUS com doses e gestão restrita a ADMIN (RF008).
- [x] **CRUD de Unidades Básicas de Saúde (UBSs):** Consulta, cadastro e cálculo geográfico por proximidade.
- [x] **Módulo de Dependentes (`src/modules/dependents`):** CRUD, caderneta e registro manual do dependente pelo responsável (RF012/RS004/RS008, D33). Futuro: dependente assumir a própria conta, transferência aos 18 anos, mais de um responsável.
- [x] **Módulo de Caderneta e Registro de Aplicações (`src/modules/vaccination-records`):** Registro de aplicação presencial por profissional (RS006/RF010) e cálculo dos status da caderneta (`EM_DIA`, `ATRASADA`, `COMPLETA`).
- [x] **Dashboard do Profissional (`src/modules/dashboard`):** Indicadores, últimas doses e série mensal (RF009/RS005), incluindo dependentes (D33).
- [x] **OCR da caderneta (`ocr-service` + `POST /vaccination-records/ocr`):** modelos de caderneta, identificação, alinhamento e células preenchidas (D34). Futuro: motor de escrita à mão (TrOCR), mais modelos, carimbos e etiquetas, esquemas por faixa etária.
- [x] **Verificação de Profissionais (`src/modules/professionals`):** Aprovação/recusa manual pelo ADMIN (RS001).
- [ ] **Coleção de Requisições / Documentação de Teste:** Contrato pronto em `docs/API.md`; falta a coleção Insomnia/Postman/cURL para demonstrar na banca.
