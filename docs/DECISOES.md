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

### D27 — Logout revoga o refresh token no servidor, de forma idempotente
- **Decisão:** `POST /auth/logout` recebe o `refreshToken` da sessão atual e grava `revokedAt` nele. Responde sempre `204`, mesmo se o token não existir, estiver expirado ou já revogado. A rota é pública: o próprio refresh token prova a sessão, e o access token pode já ter expirado quando o usuário sai.
- **Motivo:** apagar o token só no cliente deixaria a sessão válida por até 30 dias se o token tivesse vazado. A resposta idempotente deixa o cliente sair sempre e não revela se um token existe.
- **Requisito:** RNF de segurança; LGPD.

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
- **Exceção (D33):** para o dependente, o CPF é opcional (muitas crianças não têm), mas, se informado, é validado e único em toda a base. O responsável vê o CPF completo dos próprios dependentes; o profissional, mascarado.
- **Requisito:** RF001, RF007, RF010; LGPD.

### D26 — Consentimento explícito à Política de Privacidade no cadastro
- **Decisão:** `POST /users` exige `acceptedPrivacyPolicy: true` (`400` se ausente ou `false`). O backend grava em `User` a data/hora do aceite (`privacyConsentAt`) e a versão da política aceita (`privacyPolicyVersion`, hoje `"2026-10"`, em `src/config/privacy.ts`). Os dois campos só aparecem para o próprio titular (`GET /auth/me`), nunca em respostas sobre outra pessoa. Os usuários do seed já nascem com o consentimento preenchido.
- **Motivo:** a LGPD exige que o controlador prove o consentimento (art. 8º, §2º), e dado de saúde precisa de consentimento específico e destacado (art. 11, I). Guardar a versão permite saber a qual texto o usuário concordou e pedir novo aceite quando a política mudar.
- **Observação:** as colunas aceitam nulo por causa de contas anteriores à exigência. A obrigatoriedade é garantida pela validação (Zod) no cadastro, como no D14.
- **Requisito:** RF001; LGPD.

### D21 — Lista de doses atrasadas só para profissional verificado (busca ativa)
- **Decisão:** o `GET /dashboard/overdue` lista as pessoas (CIDADAO e PROFISSIONAL_SAUDE ativos, incluindo dependentes com o nome do responsável, D33) com vacina `ATRASADA`, com nome, CPF mascarado e as vacinas em atraso, e, em outro grupo, as pessoas com doses aguardando conferência (D32). Só o profissional verificado acessa; o `ADMIN` continua apenas com o total agregado do `/summary` (D05). O cálculo é o mesmo do card "Doses atrasadas", para que os números batam.
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

### D30 — Cadastro manual pelo titular, editável até a confirmação
- **Decisão:** `CIDADAO` e `PROFISSIONAL_SAUDE` (verificado ou não, D11) registram doses na própria caderneta via `POST /vaccination-records`. O titular vem sempre do token. O registro nasce com origem `MANUAL` e aguardando confirmação (D06).
  - **Validações (RS003):** a vacina precisa existir e estar ativa. A dose precisa pertencer à vacina. A data de aplicação não pode ser futura nem anterior à data de nascimento do titular. O lote é opcional e segue a regra do confirm. A mesma dose não pode ser registrada duas vezes na caderneta (409).
  - **Edição e exclusão:** o titular edita (`PUT`) ou exclui (`DELETE`) o próprio registro só enquanto ele não estiver `CONFIRMADO`. Registro de outra pessoa ou já confirmado responde 403. Depois da confirmação, só um profissional pode corrigir o registro (trabalho futuro).
  - **Status do registro:** o campo `status` do `VaccinationRecord` reaproveita o enum `VaccineStatus`. Num registro, **qualquer valor diferente de `CONFIRMADO` (hoje `EM_DIA`) significa "aguardando confirmação"**. Os valores `ATRASADA` e `COMPLETA` descrevem o esquema da vacina, calculado na caderneta, e não o registro. Na confirmação (`/confirm`), o registro manual é promovido com `action: "CONFIRMED_EXISTING"`, como os registros do seed.
  - **Dependentes:** o responsável registra, edita e exclui doses na caderneta do dependente pelas rotas `/dependents/:id/vaccination-records`, com as mesmas regras. A data de aplicação é comparada com o nascimento do dependente (D33).
- **Melhoria futura:** separar um enum próprio para o status do registro (ex.: `PENDENTE`/`CONFIRMADO`), sem misturar com o status do esquema vacinal. Isso exige migration e ajustes no seed, na caderneta, no dashboard e no confirm.
- **Motivo:** permitir que o cidadão digitalize o histórico (RF005) sem que um registro não validado ganhe o peso de uma confirmação presencial. Bloquear a alteração após a confirmação preserva a validação por terceiro (RS006). Reaproveitar o enum evita uma migration perto da pré-banca.
- **Requisito:** RF005, RS003, RS004, RF010.

### D32 — Só a dose confirmada encerra a pendência: atrasada × aguardando conferência
- **Decisão:** para os alertas e a busca ativa, cada vacina da caderneta fica em uma de três situações (critério estrito do RF007 nota 7: um registro do cidadão não confirmado não conta como dose resolvida):
  - **`ATRASADA`:** a próxima dose venceu e não existe nenhum registro dela, nem pendente. Mostra os dias em atraso (acima de 1 ano, o app e o web exibem "há mais de 1 ano").
  - **`AGUARDANDO_CONFERENCIA`:** não há dose vencida sem registro, mas há doses informadas pelo cidadão (`MANUAL`/`OCR_ICR`) e ainda não confirmadas por um profissional. Não conta dias de atraso: é uma pendência, não um atraso.
  - **`EM_DIA` / `COMPLETA`:** sem pendências, ou seja, considerando só as doses confirmadas.
  - Uma vacina pode estar `ATRASADA` e ter também doses aguardando conferência (doses diferentes, por exemplo a 1ª informada e a 2ª vencida sem registro).
- **Onde vale:**
  - **Alertas do app (RF007):** o alerta continua ativo para as doses aguardando conferência, com a mensagem "Dose informada · leve sua caderneta à UBS para conferência", sem dias de atraso. A notificação consolidada pode citar os dois grupos.
  - **Busca ativa (`GET /dashboard/overdue`, D21):** dois grupos, `status=ATRASADA` (padrão) e `status=AGUARDANDO_CONFERENCIA`, com os totais de pessoas e doses de cada um. O Gerenciador Web mostra os dois separados.
  - **Card "Doses atrasadas" (`GET /dashboard/summary`):** conta só as `ATRASADA` (sem registro), para não inflar o número, e traz à parte o total aguardando conferência. Sem busca, os totais do `/overdue` batem com os do card.
- **Implementação:** a regra fica no backend (D01), em `calculateAlertStatus` (`CalculateVaccineStatusService`), usada pela caderneta (campo `alert`), pelo `/overdue` e pelo `/summary`. O `status` da caderneta continua o do esquema (todo registro conta como aplicado), porque é a base da próxima dose e da data prevista.
- **Motivo:** o registro do cidadão não pode encerrar o alerta (nota 7), mas tratá-lo como atraso inflaria os números: no seed, 78 doses aguardam conferência e só 18 vacinas estão de fato atrasadas, e as vacinas só com registros pendentes passariam a contar o atraso desde o nascimento. Separar os grupos dá ao profissional duas ações distintas: procurar quem não tomou a dose e conferir quem já informou.
- **Requisito:** RF007 (nota 7), RF009, RF010; D06, D21.
- **Ajuste (2026-11-04, D35):** as três situações valem só para vacinas com pelo menos um registro na caderneta (esquema iniciado). Vacina nunca iniciada não gera alerta nem aparece na caderneta.

### D35 — Alerta de atraso só para esquemas iniciados
- **Decisão:** o alerta de atraso (`ATRASADA`, D32) vale para **esquemas iniciados**, ou seja, para as doses seguintes de uma vacina que já tem registro na caderneta (confirmado ou aguardando conferência). Vacina **nunca iniciada** não gera alerta e não aparece na caderneta.
  - **Pontos que seguem a regra:** caderneta (`GET /citizens/:id/vaccination-records` e `/dependents/:id/vaccination-records`), `/dashboard/summary`, `/dashboard/overdue` e alertas do app. Todos já calculam a situação a partir dos registros (`calculateAlertStatus`), então continuam mostrando a mesma coisa.
  - **Vacinas novas do catálogo (D34):** Varicela, Hepatite A, Dupla Adulto, DTP, Tetra Viral, Meningocócica ACWY, COVID-19 e Pneumocócica 23V só aparecem para quem tem registro delas. Exemplo: no seed, a cidadã `cidadao03` (bebê de 9 meses) continua com as mesmas 6 vacinas na caderneta.
- **Alternativa avaliada e descartada:** avaliar também as vacinas nunca iniciadas contra uma janela de idade simplificada para iniciar o esquema.
  - **Impacto no seed:** +34 vacinas atrasadas em 14 pessoas. A D32 ao pé da letra, sem janela, daria +359.
  - **Por que não:** as janelas simplificadas não valem para adultos (ex.: Tríplice Viral e Febre Amarela até 59 anos, Hepatite B em qualquer idade). Além disso, a mudança mexeria na caderneta, no dashboard e na busca ativa do back, do web e do app às vésperas do congelamento.
- **Limitação:** a criança que nunca tomou uma vacina do calendário (ex.: Meningocócica C aos 3 meses) não recebe alerta dela; só das doses seguintes das vacinas que já começou.
- **Melhoria futura:** avaliar as vacinas nunca iniciadas contra o calendário do PNI, com janelas de idade por vacina e por público (criança, adolescente, adulto, gestante, idoso), conferidas com a nota técnica vigente.
- **Motivo:** sem janelas de idade confiáveis, alertar vacinas nunca iniciadas geraria falsos atrasos em massa, principalmente para adultos, e inflaria o dashboard e a busca ativa. Limitar o alerta aos esquemas iniciados mantém a regra previsível e coerente nos três clientes.
- **Requisito:** RF006, RF007, RF009; D32, D34.

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

### D28 — Dados das UBS do seed conferidos com o CNES/DATASUS
- **Decisão:** CEP, logradouro, número, bairro, telefone e coordenadas das UBS do seed vêm do CNES/DATASUS (arquivo `tbEstabelecimento`, competência 2026.09, acessado em 23/10/2026). Nomes e horários continuam os do seed. Um campo só é atualizado quando o valor do CNES está preenchido e o código CNES corresponde à mesma unidade (mesmo nome). Coordenadas só são aceitas dentro de Maceió (lat -9.75 a -9.30, lon -35.90 a -35.55); fora disso, mantém-se a anterior e a UBS fica pendente de conferência. Unidades desativadas no CNES (`CO_MOTIVO_DESAB`) não são desativadas automaticamente. CEPs do CNES são mantidos mesmo quando genéricos (ex.: 57080-000).
- **Ajustes na conferência:** códigos que apontavam para outro estabelecimento foram trocados pelo código correto, buscado por nome entre as UBS de Maceió. Chã de Bebedouro e Rio Novo passaram a usar o nome oficial do CNES. Lourença de Carvalho foi substituída pela unidade real do código 2009684 (UBS Vanderli Maria de Andrade, Riacho Doce). Gruta de Lourdes e Petrópolis saíram do seed por não terem correspondente no CNES. O seed ficou com 34 UBS.
- **Coordenadas conferidas manualmente:** nestas 4 UBS a coordenada está incorreta na própria base do CNES, conforme as fichas do estabelecimento. O endereço segue o CNES e a posição foi obtida no Google Maps a partir do endereço oficial (dentro dos limites de Maceió). Não resta nenhuma UBS a conferir.
  - 3020738 UBS Geraldo Melo (Rua do Campo, s/n, Bom Parto): a do CNES caía a 30 km, perto de Paripueira. Agora -9.64921, -35.74615.
  - 2009870 USF Prof. Durval Cortez (Rua João Lúcio Marques, 64, Prado): a do CNES caía a 10 km, fora da área urbana. Agora -9.67059, -35.74658.
  - 2003325 UBS Dr. Aliomar Almeida Lins (Lot. Bela Vista II, s/n, Benedito Bentes II): a do CNES caía no oceano (lon -34.86). O endereço antigo do seed (Rua Goiás, Farol) foi trocado pelo do CNES, com telefone e horário da ficha. Agora -9.56344, -35.72431.
  - 9306471 UBS Maria Tereza Holanda Costa (Rua Padre Cícero, 224, Ouro Preto): a do CNES caía fora de Maceió (lon -36.06). Sem telefone no CNES. Agora -9.60406, -35.73144.
- **Acentuação:** logradouros que vieram do CNES sem acento foram corrigidos só quando a grafia correta é evidente (ex.: Rua São Luís, Rua Muniz Falcão).
- **Motivo:** usar fonte oficial em vez de endereços aproximados, sem misturar dados de estabelecimentos diferentes nem aceitar coordenadas visivelmente erradas do cadastro.
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
- **Limitação:** as notificações locais refletem a caderneta da última vez que o app foi aberto (ou atualizado). Uma dose confirmada depois disso só sai dos alertas quando o app abrir de novo, e o agendamento cobre um horizonte limitado de dias.
- **Melhorias futuras:** Expo Push como complemento (avisos do servidor, `POST/DELETE /devices`) e envio diário por e-mail pelo backend (rotina agendada), porque os dois funcionam mesmo com o app fechado e usam a caderneta atual.
- **Atualização (2026-10-28): notificações do sistema adiadas para a etapa final.** No Expo Go do Android (SDK 58), criar o canal de notificações falhava (NullPointerException no módulo nativo) e tocar na notificação fechava o app, sem erro no JavaScript. Para não deixar funcionalidade com erro no projeto, o `expo-notifications` foi retirado do app, com o agendamento, o pedido de permissão e as preferências no Perfil. Por agora, os alertas do RF007 ficam **dentro do app**: Central de notificações, avisos na Início e na Caderneta, com a regra do D32. Na etapa final, as notificações locais serão validadas num APK (EAS Build); se não funcionarem, entra o envio diário por e-mail pelo backend, sugerido pelo orientador. O código completo está no commit `840e50d` do repositório do front-end.
- **Requisito:** RF007.

### D31 — Lembrete antecipado da próxima dose (ampliação do RF007)
- **Decisão:** além do alerta de atraso, o app avisa **7 dias antes** e **no dia** da data prevista da próxima dose. Os lembretes entram na mesma notificação consolidada do dia (uma por dia, com todas as vacinas) e podem ser desligados no Perfil separadamente dos alertas de atraso.
- **Situação atual (2026-10-28):** com as notificações do sistema adiadas para a etapa final (D24), o lembrete aparece **dentro do app**: a Central de notificações mostra a dose prevista para hoje e as previstas para os próximos 7 dias. A notificação consolidada e os interruptores no Perfil voltam na etapa final (no APK ou como parte do e-mail diário).
- **Motivo:** sugestão dos professores: evitar o atraso, e não só avisar depois dele.
- **Requisito:** RF007 (ampliação); D24.

### D25 — OCR como microsserviço Python chamado pelo backend
- **Decisão:** o OCR da caderneta física roda em um microsserviço Python separado (OpenCV no pré-processamento + `pytesseract`). O app envia a foto ao backend, que chama o serviço e devolve as doses reconhecidas para revisão. Os registros são gravados com origem `OCR_ICR` e ficam pendentes de confirmação (D06). Se o OCR falhar, o app oferece o cadastro manual.
- **Motivo:** isola as dependências de visão computacional da API Node e mantém o app como cliente simples (D01).
- **Requisito:** RF004, RS003, RNF05, RNF12.
- **Atualização (2026-11-04):** o escopo da leitura passou a ser por modelos de caderneta (D34).

### D34 — OCR por modelos de caderneta: o OCR sugere, o cidadão confere
- **Contexto (PoC, D25):** lendo a página inteira, o OCR acertou 0 de 2 campos; recortando por âncoras, 1 de 2. O gargalo é o Tesseract não reconhecer dígitos manuscritos, e as cadernetas reais variam muito de layout.
- **Decisão (escopo):** o sistema suporta um **conjunto fechado de modelos de caderneta** (templates em `ocr-service/templates/<modelo>/`, com `reference*.png` e `cells.json`). Foto de outro modelo, ou leitura sem confiança, cai no cadastro manual (RNF12). Modelos atuais:
  - **`caderneta-crianca-ms`:** Caderneta da Criança (MS), tabelas "até 12 meses" e "a partir de 12 meses".
  - **`caderneta-maceio-jovens-adultos`:** Caderneta de Vacinação de Jovens e Adultos da Prefeitura de Maceió, com 16 blocos impressos e 16 livres.
- **Decisão (pipeline):** a entrada é a foto da página inteira (ou das duas páginas abertas).
  1. **Identificação:** SIFT + RANSAC contra a referência de cada página, com mínimo de 40 inliers; páginas sobrepostas do mesmo modelo são descartadas.
  2. **Alinhamento:** homografia, com verificação da impressão reencontrada na foto.
  3. **Células:** recorte das células mapeadas, com ajuste local por correlação.
  4. **Células vazias:** descartadas pela densidade de tinta à mão (tinta escura fora da impressão da referência, ignorando manchas amareladas).
  5. **Leitura:** só das células preenchidas.
- **Decisão (o que vem de onde):**
  - **Vacina e dose impressas no modelo:** vêm da **posição** da célula. O OCR sugere data e lote.
  - **Blocos livres:** a vacina vem do OCR, com match aproximado no catálogo pelo nome ou pelos aliases (campo novo `Vaccine.aliases`, migration `vacinas_aliases`); se não casar, fica vazia. A leitura reaproveita o método da rodada 2 da PoC (âncoras dos rótulos, limpeza, Otsu e adaptativa, psm 7 e 8) no bloco alinhado, testando algumas alturas do bloco.
  - **Lote no modelo de Maceió:** a faixa do lote começa acima da linha do FAB, porque na prática o lote é escrito sobre ela.
  - **Cada campo vem com o recorte da imagem.** Com baixa confiança (< 0,45), o valor vai vazio e o cidadão preenche olhando o recorte (RF004).
- **Decisão (catálogo):**
  - **Vacinas novas no seed:** Meningocócica ACWY (aliases ACWY, MenACWY, MENINGO ACWY), COVID-19, Dupla Adulto (dT), DTP (Tríplice Bacteriana), Tetra Viral (SCRV), Varicela, Hepatite A e Pneumocócica 23-Valente.
  - **Fora do cálculo de atraso (D32):** COVID-19 (esquema variável) e Pneumocócica 23V (público específico) ficam sem idade recomendada e sem intervalo, como a dTpa, então nunca vencem sozinhas. A 1ª dose da dT depende do histórico (sem idade); as seguintes contam a partir da anterior.
  - **Atraso só com registro (D35):** a situação de atraso é calculada só para vacinas com registro na caderneta, então as vacinas novas não inflam o dashboard nem a busca ativa. Conferido no seed (referência 04/11/2026): 23 vacinas atrasadas (11 pessoas) e 77 doses aguardando conferência (30 pessoas), antes e depois.
  - **Doses impressas sem correspondente:** não foram criadas doses novas. Hepatite B 1ª/2ª/3ª do adulto e a 2ª dose do HPV voltam com `doseId: null` e o cidadão escolhe a dose na revisão. Febre Amarela "Dose única"/"Dose" → 1ª Dose; VOP 1º/2º Reforço → doses 4 e 5 da VIP ("1º/2º Reforço (VOP/VIP)").
- **Decisão (API):**
  - **`POST /vaccination-records/ocr`:** autenticado, `CIDADAO`/`PROFISSIONAL_SAUDE`. Recebe multipart com uma imagem JPEG/PNG de até 8 MB, encaminha ao serviço com timeout de 20 s e devolve só sugestões com `vaccineId`/`doseId` do catálogo. **Não cria registros.** Serve para o titular e para os dependentes.
  - **Imagem (LGPD):** processada em memória (multer `memoryStorage`) e descartada, nunca salva nem logada.
  - **Falhas:** erros com `code` (`OCR_INDISPONIVEL`, `OCR_TIMEOUT` etc.) e `manualFallback: true` quando nada foi reconhecido, para o app cair no cadastro manual.
  - **Salvamento:** pelas rotas de cadastro manual (D30), que passaram a aceitar `origin: "OCR_ICR"` e `ocrConfidence` (0–1), opcionais. O registro continua aguardando confirmação (D06).
- **Situação medida (2026-11-04):** na foto do cartão de Maceió, o modelo é identificado (2494 inliers, alinhamento "boa") e só o bloco preenchido (ACWY) é encontrado, sem falsos positivos nos blocos manchados. Data e lote manuscritos voltam vazios: o Tesseract não os reconhece em nenhuma variação testada (altura, espessura, `por`/`eng`, caractere a caractere). A vacina do bloco livre (ACWY) só casou com o catálogo porque a leitura testa várias alturas do bloco (600, 700, 500 e 800 px). Aplicado sem mudanças ao bloco alinhado (cerca de 340 px de altura), o método da rodada 2 leu "PCcwy"/"PreWy". O acerto veio em 600 px ("Acwy", exato) e em 700 px ("Pcwy", com uma letra de diferença), e falhou em 550, 650, 750, 800 e 850 px. É um **acerto pontual e frágil**: não demonstra que a vacina manuscrita é lida de forma confiável. A medição com fotos reais usa `avaliar_templates.py` (gabarito `X.txt` com várias doses por imagem).
- **Melhorias futuras:**
  - Modelo de reconhecimento de escrita à mão (ex.: TrOCR) no lugar do Tesseract, sem mudar o contrato.
  - Mais modelos de caderneta.
  - Leitura de carimbos e etiquetas de lote.
  - Esquemas por faixa etária no catálogo (Hepatite B do adulto em 3 doses, HPV em 2 doses), para que essas células tenham `doseId`.
- **Motivo:** com o layout conhecido, a posição resolve vacina e dose sem depender do OCR, e o reconhecimento do modelo e das células preenchidas já poupa o cidadão de procurar as doses na caderneta. Limitar a modelos conhecidos troca abrangência por confiabilidade, e o cadastro manual cobre o resto.
- **Requisito:** RF004, RF005, RNF05, RNF12, RS003; D06, D25, D30, D32.

### D29 — "Ver no mapa" do detalhe da vacina abre a localização de UBS
- **Decisão:** o atalho "Ver UBS no mapa" do detalhe da vacina redireciona para a localização de UBS (aba UBS, já no Mapa). Exibir a UBS onde a dose foi aplicada fica como melhoria futura.
- **Motivo:** hoje a confirmação de dose não registra a UBS, e incluí-la muda o fluxo do backend.
- **Requisito:** RF008 (nota 9).

## Dependentes

### D33 — Dependente é um cidadão sem credenciais, ligado ao responsável
- **Decisão (modelagem):** o dependente é um `User` com perfil `CIDADAO`, **sem e-mail e sem senha** (`email` e `passwordHash` passaram a aceitar nulo), ligado ao responsável por `responsibleId`. O model `Dependent` e a coluna `vaccination_records.dependent_id`, que nunca foram usados por endpoints, foram removidos (migration `dependentes_como_usuarios`). Campos novos em `User`: `sex` (`MASCULINO`/`FEMININO`) e `relationship` (`FILHO`, `PAI_MAE`, `CONJUGE`, `CURATELADO`, `OUTRO`, opcional).
  - **Reaproveitamento:** caderneta, `CalculateVaccineStatusService`, as três situações do D32, o registro manual (D30), a confirmação (D06), a busca e o dashboard funcionam sem lógica duplicada, porque os registros continuam ligados por `userId`.
  - **`onDelete: Restrict`:** apagar o responsável não pode apagar em cascata doses confirmadas, que são dado de saúde. Na prática, contas são só desativadas (D16), e os dependentes de um responsável desativado continuam visíveis para o profissional.
  - **Sem login:** sem e-mail, o dependente nunca é encontrado no login, no "esqueci a senha" nem na troca de senha. A gestão de usuários do admin (`/users`) ignora dependentes (`404` no detalhe, na edição e na desativação), porque eles não são contas.
- **Decisão (regras):**
  - **Quem cadastra:** `CIDADAO` ou `PROFISSIONAL_SAUDE` (o profissional também é cidadão, D11). Dependente não tem dependentes.
  - **Idade (ECA):** no cadastro, o dependente precisa ter menos de 18 anos, exceto quando o parentesco é `CURATELADO`, que aceita qualquer idade. A data de nascimento nunca é futura. Quem completa 18 anos depois do cadastro continua normalmente: a regra só é reavaliada quando a data de nascimento ou o parentesco mudam.
  - **RS008 (duplicidade, 409):** CPF já usado por qualquer pessoa da base; ou mesmo nome (sem acentos, maiúsculas e espaços extras, como no D15) e mesma data de nascimento para o mesmo responsável. Responsáveis diferentes podem cadastrar a mesma criança sem CPF (o caso de dois responsáveis fica para depois).
  - **RS004 (acesso):** os dados do dependente são acessados só pelo responsável (rotas `/dependents/...`) e por profissionais verificados (rotas `/citizens/...` e `/confirm`). Por `/dependents`, um id que não é dependente do usuário logado responde `404`, sem revelar se o cadastro existe. O `ADMIN` continua só com agregados (D05).
  - **Edição:** dados básicos (nome, nascimento, sexo, CPF, parentesco). A nova data de nascimento não pode ficar depois de uma dose já registrada.
  - **Remoção:** só se não houver dose `CONFIRMADO`; os registros pendentes são apagados junto. Com dose confirmada, `409`.
  - **RS006:** o profissional não confirma dose própria nem dos próprios dependentes.
  - **Profissional:** a busca de cidadãos inclui dependentes com o nome do responsável. A busca pelo CPF do responsável traz também os dependentes dele, porque a criança muitas vezes não tem CPF. A busca ativa (`/overdue`) e as doses recentes também mostram o responsável. As métricas agregadas passam a contar os dependentes (resolve o antigo D09).
- **Melhorias futuras:**
  - Dependente com CPF assumir a própria conta ao criar login: hoje o cadastro público responde `409` (CPF já cadastrado). O caminho é converter o dependente em titular (preencher e-mail, senha e consentimento, limpar `responsibleId`), mantendo a caderneta.
  - Transferência do dependente ao completar 18 anos.
  - Mais de um responsável por dependente, com convite para o outro responsável.
- **Motivo:** uma tabela separada obrigaria cada serviço da caderneta, do confirm e do dashboard a aceitar "usuário **ou** dependente", duplicando consultas em cerca de 10 lugares, perto da pré-banca. Com o dependente como `User`, as regras já validadas (D30, D32, RS006) valem para ele automaticamente.
- **Requisito:** RF012, RS004, RS006, RS008; D09 (resolvido), D11, D14, D30, D32.

## Entrega

D36 — Notificações locais e APK: decisão do app, registrada no repositório do frontend.

### D37 — Congelamento do código a partir de 11/11/2026
- **Decisão:** a partir de **11/11/2026**, antes da banca de **17/11/2026**, o código fica congelado.
  - **Não entram:** funcionalidades novas, mudanças de tela, mudanças no contrato da API (`docs/API.md`) ou no schema do banco (`prisma/schema.prisma`, migrations).
  - **Podem entrar:**
    - correções de bugs encontrados em teste;
    - calibração do OCR restrita ao `ocr-service` (`cells.json`, limiares de identificação, alinhamento e densidade de tinta, pré-processamento), sem mudar o formato da resposta;
    - documentação, seed e textos.
  - **OCR sem novo APK:** a calibração roda no servidor, então não exige gerar outro APK do app.
  - **Fluxo:** toda mudança depois do congelamento vai em commit `fix:`, `docs:` ou `chore(ocr):` na `dev`, com PR para a `main`.
- **Motivo:** chegar à banca com uma versão estável e já testada nos três clientes, sem risco de quebrar o que foi validado. O OCR é a parte que mais depende de ajuste com fotos reais e pode ser calibrado sem afetar o contrato nem o app.
- **Requisito:** processo de entrega do TCC; D25, D34.
