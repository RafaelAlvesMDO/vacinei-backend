# Decisões de arquitetura e regras de negócio — VACINEI!?

Registro curto das decisões do projeto. Formato: **decisão** · motivo · requisito relacionado.
Consulte este arquivo antes de alterar qualquer regra de negócio.

## Arquitetura

### D01 — Regras de negócio centralizadas no backend
- **Decisão:** toda regra de negócio fica na API (camada de services). O painel web e o app mobile são apenas clientes e não decidem permissões, validações ou cálculos.
- **Motivo:** fonte única de verdade, consistência entre clientes e segurança (o cliente não é confiável).
- **Requisito:** arquitetura geral; RNF de segurança.

### D22 — Paginação no servidor com formato único; catálogos sem paginação
- **Decisão:** listas que crescem com o uso (`GET /users`, `GET /professionals`, `GET /dashboard/overdue`) são paginadas no servidor com `?page=` (padrão 1) e `?limit=` (padrão 20, máximo 100) e respondem `{ items, total, page, limit, totalPages }`. Busca e filtros rodam no banco antes da paginação (no `/overdue`, o status é calculado em memória e a página é cortada depois de ordenar). Listas com abas de status devolvem `counts` com o total por status, sem aplicar o filtro de status. `GET /ubs` e `GET /vaccines` seguem sem paginação.
- **Motivo:** evitar baixar a base inteira no painel, manter um contrato só para o front e mostrar os contadores das abas sem buscar tudo. UBSs e vacinas são catálogos limitados (dezenas de itens) usados inteiros em selects e mapas.
- **Requisito:** RNF de desempenho; RF003, RS001, RF009.

## Autenticação e perfis

### D02 — Cadastro público só para CIDADAO e PROFISSIONAL_SAUDE
- **Decisão:** o cadastro aberto aceita apenas `CIDADAO` e `PROFISSIONAL_SAUDE`. `ADMIN` só é criado por outro admin ou pelo seed.
- **Motivo:** impedir escalada de privilégio pelo endpoint público.
- **Requisito:** RBAC; RS001.

### D03 — Verificação manual de profissionais pelo admin
- **Decisão:** profissional cadastrado publicamente fica pendente até um `ADMIN` verificá-lo. Profissional criado por admin já nasce verificado. A integração com os conselhos de classe (COREN, CRM etc.) é trabalho futuro.
- **Motivo:** garantir que só profissionais reais confirmem doses, sem depender de APIs externas que não estão disponíveis no prazo do TCC.
- **Requisito:** RS001.

### D12 — Conselho derivado da categoria profissional
- **Decisão:** o cliente informa a categoria (lista em D13) e o backend deriva o conselho (CRM, COREN, CRF). A UF do registro vem no campo `uf` ou como sufixo do número (`123456-AL`).
- **Motivo:** evita combinações inválidas de categoria e conselho e mantém a regra no backend (D01).
- **Requisito:** RF001, RS001.

### D13 — Categorias profissionais restritas à vacinação
- **Decisão:** as categorias aceitas são `MEDICO` (CRM), `ENFERMEIRO`, `TECNICO_ENFERMAGEM`, `AUXILIAR_ENFERMAGEM` (COREN) e `FARMACEUTICO` (CRF). `CIRURGIAO_DENTISTA` (CRO) foi removida e `AUXILIAR_ENFERMAGEM` adicionada.
- **Motivo:** só entram categorias que atuam na aplicação de vacinas ou no acompanhamento dos indicadores.
- **Requisito:** RF001, RS001.

### D04 — Código de recuperação salvo como hash e resposta genérica
- **Decisão:** o código de 6 dígitos é guardado só como hash (10 min de validade, 3 tentativas erradas bloqueiam por 15 min). O endpoint de "esqueci a senha" sempre responde com a mesma mensagem, exista ou não a conta. O reset bem-sucedido revoga todos os refresh tokens.
- **Motivo:** vazamento do banco não expõe códigos válidos; evita enumeração de contas e força bruta.
- **Requisito:** recuperação de senha; LGPD/segurança.

### D16 — Desativação de usuário bloqueia o acesso na hora
- **Decisão:** desativar um usuário (`DELETE /users/:id` ou `PUT /users/:id` com `isActive: false`) revoga todos os refresh tokens dele. O `ensureAuthenticated` consulta o banco a cada requisição e responde `401` se o usuário não existe ou está inativo, mesmo com access token válido.
- **Motivo:** sem isso, o access token já emitido seguia válido por até 15 min. O custo é uma consulta por chave primária a cada requisição autenticada.
- **Requisito:** RBAC; RNF de segurança.

### D17 — Login confere a senha antes de informar conta desativada
- **Decisão:** o `POST /auth/login` compara a senha antes de verificar `isActive`. E-mail inexistente ou senha errada sempre respondem `401 Credenciais inválidas.`; só com a senha correta uma conta desativada recebe `403`. Quando o e-mail não existe, a senha é comparada com um hash bcrypt fictício de mesmo custo, para o tempo de resposta não revelar se a conta existe.
- **Motivo:** antes, o `403` saía mesmo com senha errada, revelando que o e-mail estava cadastrado.
- **Requisito:** RF002 nota 1 (mensagem genérica contra enumeração de contas); LGPD/segurança.

### D18 — Custo do bcrypt centralizado em 10
- **Decisão:** o custo do bcrypt passou de 8 para 10 e fica numa única constante, `authConfig.bcryptSaltRounds` (`src/config/auth.ts`), usada no cadastro, no reset de senha, no seed e no hash fictício do login (D17). Senhas já salvas com custo 8 continuam válidas, porque o hash guarda o próprio custo; elas passam a custo 10 quando o usuário redefine a senha.
- **Motivo:** 10 é o mínimo usual recomendado e deixa a força bruta offline ~4x mais cara. A constante única evita custos divergentes, o que também quebraria a igualdade de tempo do D17.
- **Requisito:** RNF de segurança; LGPD.

### D19 — Perfil: só o nome é editável; troca de senha encerra as outras sessões
- **Decisão:** `PATCH /auth/me` aceita apenas `name` (mesma validação do cadastro) e recusa qualquer outro campo; o id vem do token. E-mail e celular ficam bloqueados até existir a reverificação por código (trabalho futuro). CPF, data de nascimento, perfil, registro e categoria não são editáveis. `PATCH /auth/me/password` exige a senha atual (`401` se errada), aplica a regra de senha do RF001, recusa nova senha igual à atual e revoga os demais refresh tokens; a sessão atual só é mantida se o cliente enviar o próprio `refreshToken`, porque o access token não identifica a sessão.
- **Motivo:** alterar e-mail/celular sem nova verificação permitiria sequestro de conta; revogar as outras sessões segue o mesmo princípio do reset (D04).
- **Requisito:** RF003 (notas 2, 3, 5, 6 e 7); RS002.

### D20 — Uma só rota para o usuário editar o próprio perfil
- **Decisão:** o `PUT /users/me` foi removido e o `PUT /users/:id` passou a ser só de ADMIN (alterações administrativas). O próprio usuário edita o perfil apenas pelo `PATCH /auth/me` (D19).
- **Motivo:** o `PUT /users/me` e o `PUT /users/:id` com o próprio id deixavam o usuário alterar celular e data de nascimento, contra o RF003. O frontend web não usava a rota; só o admin usa `PUT /users/:id` (`{ isActive }`).
- **Requisito:** RF003 (notas 3, 5 e 6); RS002.

## Privacidade (LGPD)

### D05 — Admin acessa só dados agregados de vacinação
- **Decisão:** o `ADMIN` vê métricas e séries agregadas (dashboard, relatórios), nunca a caderneta individual de um cidadão.
- **Motivo:** LGPD, princípio da necessidade: a função de gestão não exige dado pessoal de saúde.
- **Requisito:** relatórios/dashboard; LGPD.

### D14 — CPF e data de nascimento obrigatórios; CPF mascarado para terceiros
- **Decisão:** CPF e data de nascimento são obrigatórios no cadastro de todos os perfis.
  - O CPF é aceito com ou sem máscara, validado pelos dígitos verificadores, salvo só com os 11 números e único (409 se repetido).
  - A data de nascimento não pode ser futura.
  - O CPF completo só aparece para o próprio titular (`/users/me`, login, cadastro). Em listagens e em respostas sobre outra pessoa (admin, busca de cidadãos), ele vem mascarado (`***.123.456-**`).
  - O profissional encontra um cidadão pelo CPF completo (busca exata em `GET /citizens`) e recebe de volta só a versão mascarada.
- **Motivo:**
  - Finalidade do CPF: identificar a pessoa de forma inequívoca no atendimento (RF010), evitando confusão entre homônimos e cadastros duplicados.
  - Finalidade da data de nascimento: base do calendário vacinal (RF007).
  - LGPD: princípios da finalidade, necessidade e minimização. Quem já tem o CPF em mãos confirma a identidade, mas a API não divulga o número a terceiros.
- **Observação:** no banco as colunas continuam aceitando nulo por causa de registros antigos. A obrigatoriedade é garantida pela validação (Zod) no cadastro.
- **Requisito:** RF001, RF007, RF010; LGPD.

### D21 — Lista de doses atrasadas só para profissional verificado (busca ativa)
- **Decisão:** o `GET /dashboard/overdue` lista as pessoas (CIDADAO e PROFISSIONAL_SAUDE ativos) com vacina `ATRASADA`, com nome, CPF mascarado e as vacinas em atraso. Só o profissional verificado acessa; o `ADMIN` continua apenas com o total agregado do `/summary` (D05). O cálculo é o mesmo do card "Doses atrasadas", para que os números batam.
- **Motivo:** finalidade de **busca ativa de faltosos**: o profissional precisa saber quem procurar para completar o esquema vacinal. São dados de saúde identificados, então, pelo princípio da necessidade, ficam restritos a quem presta o atendimento, com CPF mascarado (D14) e paginação limitada (máx. 100).
- **Requisito:** RF009; RS005; LGPD.

## Caderneta

### D06 — Registro pelo cidadão → confirmação pelo profissional
- **Decisão:** o cidadão registra a dose (origem `MANUAL` ou `OCR_ICR`) e ela fica pendente. O profissional confirma presencialmente; a confirmação mantém a data original de aplicação e grava `confirmedAt` com o momento da confirmação.
- **Motivo:** permitir que o cidadão digitalize o histórico sem abrir mão da validação por um profissional, preservando a data real da vacina.
- **Requisito:** RF007 (nota 7), RF010.

### D07 — Influenza tratada como dose única por enquanto
- **Decisão:** a influenza é modelada como dose única. Vacinas anuais/sazonais (renovação por ciclo) são trabalho futuro.
- **Motivo:** simplifica o modelo de esquema vacinal para a entrega da pré-banca.
- **Requisito:** catálogo de vacinas/doses.

### D11 — O profissional de saúde também é cidadão
- **Decisão:** o profissional de saúde também é cidadão: aparece na busca, tem caderneta e pode ter vacinas confirmadas por outro profissional, mas não pode confirmar a própria vacina (RS006). O `ADMIN` continua fora da busca e das métricas.
- **Motivo:** profissionais também se vacinam; a autoconfirmação quebraria a validação por terceiro que dá valor ao status `CONFIRMADO`.
- **Requisito:** RF009, RF010, RS006.

## Catálogo

### D08 — Vacinas e UBSs gerenciadas só pelo admin; leitura pública
- **Decisão:** criar, editar e desativar vacinas e UBSs é exclusivo do `ADMIN`. Os `GET` são públicos.
- **Motivo:** são dados de referência públicos; a escrita precisa de controle para manter o catálogo confiável.
- **Requisito:** RF008.

### D10 — UBS desativada em vez de excluída
- **Decisão:** uma UBS que deixa de existir é desativada (`isActive = false`) pelo `ADMIN` via `PATCH /ubs/:id/status`; não há exclusão. O `GET /ubs` público lista só as ativas; o `ADMIN` vê todas com `?includeInactive=true`.
- **Motivo:** registros de vacinação e campanhas apontam para a UBS; excluí-la apagaria ou quebraria o histórico.
- **Requisito:** RF008 (nota 8).

### D15 — Nome de vacina único sem diferenciar maiúsculas, minúsculas e acentos
- **Decisão:** em `POST` e `PUT /vaccines`, o nome é comparado normalizado (sem acentos, minúsculo, espaços extras removidos). "Hepatite B" e "hepatite b" conflitam com 409. Na edição, a própria vacina é ignorada.
- **Motivo:** evitar vacinas duplicadas no catálogo por diferença só de grafia.
- **Requisito:** RF008.

## App mobile

### D23 — Login único com alas Cidadão e Profissional
- **Decisão:** o app tem um só login, por e-mail e senha (RF002).
  - `CIDADAO` vai direto para a ala Cidadão.
  - `PROFISSIONAL_SAUDE` escolhe entre a ala Cidadão e a ala Profissional, cada uma com sua barra de abas. O app lembra a última ala escolhida e permite alternar pelo Perfil.
  - O profissional não verificado vê, na ala Profissional, o aviso de verificação pendente ou recusada (RS001).
  - `ADMIN` não usa o app: ele usa o Gerenciador Web.
  - As alas são só navegação. As permissões continuam no backend (D01).
- **Motivo:** o profissional também é cidadão (D11) e precisa da própria caderneta sem uma segunda conta. Separar as alas evita misturar as funções de atendimento com as pessoais.
- **Requisito:** RF002, RS001, RS006.

### D24 — Notificações locais como base; Expo Push como complemento
- **Decisão:** os alertas de vacinação são notificações locais agendadas no aparelho (`expo-notifications`), calculadas a partir da caderneta. O Expo Push entra só como complemento (avisos enviados pelo servidor) e exige development build. O FCM direto deixa de ser o plano.
- **Motivo:** notificações locais não têm custo, não dependem de backend novo e funcionam no Expo Go, usado nos testes. O Expo Go não recebe push remoto no Android.
- **Requisito:** RF007.

### D25 — OCR como microsserviço Python chamado pelo backend
- **Decisão:** o OCR da caderneta física roda em um microsserviço Python separado (OpenCV no pré-processamento + `pytesseract`). O app envia a foto ao backend, que chama o serviço e devolve as doses reconhecidas para revisão. Os registros são gravados com origem `OCR_ICR` e ficam pendentes de confirmação (D06). Se o OCR falhar, o app oferece o cadastro manual.
- **Motivo:** isola as dependências de visão computacional da API Node e mantém o app como cliente simples (D01).
- **Requisito:** RF004, RS003, RNF05, RNF12.

## Pendências

### D09 — Dependentes ainda não implementados
- **Decisão:** o módulo de dependentes ainda não existe. Quando for implementado, as doses de dependentes devem entrar nas métricas agregadas, na busca do profissional e no fluxo de confirmação (D06).
- **Motivo:** evitar que dependentes fiquem de fora de relatórios e da validação.
- **Requisito:** módulo de dependentes.
