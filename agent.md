# VACINEI!? - Diretrizes do Backend (Agent Guide)

Guia de contexto, arquitetura, stack e regras para o desenvolvimento do backend da plataforma **VACINEI!?** (TCC CESMAC).

---

## 0. Memória Contínua do Projeto (`memory.md`)

- **Consulta Obrigatória:** O agente **DEVE** consultar o arquivo `memory.md` no início de cada sessão ou tarefa para contextualizar o status atual, decisões históricas e tarefas pendentes.
- **Atualização Contínua:** O agente **DEVE** atualizar o `memory.md` sempre que concluir um módulo relevante, registrar novas decisões de arquitetura ou avançar etapas do projeto.

## 1. Stack Tecnológica

- **Runtime:** Node.js (v20+)
- **Linguagem & Framework:** TypeScript + Express 5
- **Banco de Dados:** PostgreSQL
- **ORM:** Prisma ORM
- **Validação de Dados:** Zod
- **Autenticação:** JWT (Access Token) + Refresh Tokens (persistidos no banco para revogação)
- **Criptografia:** `bcrypt` para hash de senhas
- **Processamento de Imagens, OCR & ICR:** Python (`opencv-python` + `pytesseract`) executado via `child_process` através de Provider isolado
- **Notificações Push:** Firebase Cloud Messaging (FCM via `firebase-admin`), com suporte multi-cliente (Mobile e Web)
- **Geolocalização:** OpenStreetMap (cálculo de distâncias via fórmula de Haversine)
- **Comunicação Externa:** E-mail via Nodemailer (Ethereal em dev) e SMS via MockProvider

---

## 2. Estrutura de Pastas Sugerida (`src/`)

```
src/
├── @types/          # Extensões de tipagem do Express (ex: req.user)
├── config/          # Variáveis de ambiente e configs (auth, upload, firebase)
├── constants/       # Calendário vacinal de referência, categorias de saúde
├── errors/          # Classe AppError e manipulação centralizada de erros
├── middlewares/     # ensureAuthenticated, checkRole, errorHandler, rateLimiter
├── modules/         # Módulos de domínio da aplicação
│   ├── auth/            # Login, Refresh Token, Redefinição de senha
│   ├── users/           # Cadastro de cidadão/profissional, perfil
│   ├── dependents/      # Gestão de dependentes (filhos, tutelados)
│   ├── vaccines/        # Caderneta, doses, motor de cálculo de status/alertas
│   ├── ubs/             # Gerenciamento e geolocalização de UBSs
│   ├── campaigns/       # Campanhas vacinais (criação, listagem e engajamento)
│   ├── reports/         # Relatórios e indicadores epidemiológicos
│   └── notifications/   # Registro de tokens FCM e histórico de notificações
│       └── [modulo]/    # controllers/, dtos/, services/, repositories/
├── providers/       # Abstrações e implementações de serviços externos
│   ├── MailProvider/    # IMailProvider + EtherealMailProvider
│   ├── SmsProvider/     # ISmsProvider + MockSmsProvider
│   ├── PushProvider/    # IPushProvider + FcmPushProvider (Firebase Mobile & Web)
│   └── OcrProvider/     # IOcrProvider + PythonChildProcessOcrProvider (OpenCV + ICR)
├── scripts/         # Scripts auxiliares Python (ex: ocr_icr_parser.py)
├── utils/           # Funções utilitárias (cálculo de distâncias, máscaras)
└── server.ts        # Inicialização do servidor HTTP
```

---

## 3. Padrões de Código e Arquitetura

- **Arquitetura Multi-Cliente Agnóstica:**
  - A API RESTful é estruturada de forma agnóstica a clientes, servindo uniformemente:
    - **App Mobile:** (Expo / React Native) focado no cidadão (caderneta digital, dependentes, busca de UBSs e alertas).
    - **Painel Web Administrativo:** focado em profissionais de saúde e gestores (gerenciamento de UBSs, campanhas vacinais, confirmação de doses e relatórios epidemiológicos).
  - Respostas JSON padronizadas e controle de CORS preparado para origens Web e Mobile.
- **Princípio de Responsabilidade Única (SRP):**
  - **Controllers:** Tratam requisições HTTP, delegam aos Services e devolvem respostas formatadas.
  - **Services:** Concentram 100% das regras de negócio. Nunca acessam `req` ou `res`.
  - **Repositories:** Encapsulam queries e operações do Prisma Client.
- **Validação com Zod:** Todas as entradas de rotas (`body`, `query`, `params`) devem ser validadas antes de atingir os Services.
- **Tratamento de Erros:** Disparar `throw new AppError(message, statusCode)`. O middleware global centraliza o tratamento e formatação da resposta.
- **Segurança (OWASP & LGPD):**
  - Nunca retornar senhas ou campos sensíveis nas respostas da API.
  - Mensagens de erro de login genéricas ("Credenciais inválidas") para evitar enumeração de contas (RF002).
  - Formato de datas: tráfego em ISO 8601 (`YYYY-MM-DD`).

---

## 4. Regras de Negócio e Segurança Críticas

### 4.1. Perfis e Controle de Acesso (RBAC)
- **Perfis de Usuário:** `CIDADAO`, `PROFISSIONAL_SAUDE`, `ADMIN`.
- **Registro Profissional (RS001):** Validar regex (número + UF) e autenticidade contra lista mock de conselhos de classe (CRM, COREN, etc.).
- **Isolamento de Dados (RS002 / RS004):** Operações em perfis e cadernetas devem validar se o usuário solicitante é o titular, o responsável vinculado ou um profissional autorizado.
- **Rastreabilidade Presencial (RS006 / RF010):** A confirmação de dose presencial vincula automaticamente o ID do profissional autenticado no token.
- **Painel Administrativo e Relatórios (RS005 / RF009):** Gerenciamento de UBSs, campanhas e emissão de relatórios restritos a `PROFISSIONAL_SAUDE` e `ADMIN`.

### 4.2. Autenticação e Sessão (RF002 / RF011)
- **Ciclo do Token:** Access Token stateless de curta duração (15 min) + Refresh Token opaco persistido no PostgreSQL.
- **Invalidação Global (RF011):** A redefinição de senha bem-sucedida deve revogar todos os Refresh Tokens ativos do usuário no banco.
- **Recuperação de Senha (RF011 / RS007):** Código de 6 dígitos expira em 10 min. Máximo de 3 tentativas erradas bloqueia novas requisições por 15 minutos.

### 4.3. Caderneta, Vacinas e Motor de Regras
- **Vínculo Único de Dependentes (RS008):** Impedir cadastro de dependente com mesmo `Nome Completo` e `Data de Nascimento` já cadastrado por outro responsável.
- **Consistência Vacinal (RS003):** Bloquear datas de aplicação futuras e validar nomes de vacinas contra a base do Calendário Nacional.
- **Cálculo de Status da Vacina (RF006 / RF007):**
  - `EM_DIA`: Doses tomadas ou dentro do prazo.
  - `ATRASADA`: Data atual ultrapassou a data prevista da próxima dose.
  - `COMPLETA`: Todas as doses do esquema vacinal foram concluídas.
  - `CONFIRMADO`: Dose aplicada ou conferida presencialmente por profissional (RF010).
- **Consolidação de Alertas (RF007):** Gerar notificação diária única consolidando todas as doses pendentes do usuário/dependentes.

### 4.4. Processamento de Imagens, OCR & ICR (OpenCV + Tesseract) (RF004 / RF005)
- **Pré-processamento com OpenCV:** O script Python utiliza OpenCV para pipeline de pré-processamento de imagem:
  - Conversão em escala de cinza e equalização/ajuste de contraste;
  - Redução de ruído (filtros Gaussian/Bilateral);
  - Binarização adaptativa (ex: Otsu / Adaptive Thresholding);
  - Morfologia e segmentação de regiões de interesse (ROI) da caderneta.
- **Suporte a ICR (Intelligent Character Recognition):** Otimizado via `pytesseract` com modelos/configurações para reconhecimento de caracteres e escrita manual em registros de doses e datas.
- **Execução Isolada:** Invocado via `child_process` pelo `OcrProvider`.
- **Fallback Automático (RF005):** Caso a qualidade ou o nível de confiança da extração seja insuficiente, retornar erro amigável orientando o preenchimento manual sem perda dos dados já submetidos.

### 4.5. Notificações Push com Firebase Cloud Messaging (FCM)
- **Suporte Multi-Aplicação:** O backend integra com o Firebase Console prevendo registro de 2 aplicações sob o mesmo projeto:
  - **App Mobile:** (Expo / React Native via tokens FCM Mobile / APNs).
  - **Painel Web:** (Web Push Notification via service workers / VAPID).
- **Armazenamento de Tokens:** Tabela de dispositivos associando `user_id`, `fcm_token` e tipo de cliente (`MOBILE` ou `WEB`).
- **Disparo Unificado:** O `PushProvider` abstrai as particularidades de payload (notificação nativa mobile vs. web push notification) mantendo interface unificada de envio.
