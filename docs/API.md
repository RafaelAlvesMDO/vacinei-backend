# VACINEI!? — Contrato da API

Base URL local: `http://localhost:3333`. JSON em todas as rotas. Datas em ISO 8601.

## Logins do seed (`npx prisma db seed`)

Senha de todos: **`Vacinei@2026`**

| Perfil | E-mail | Observação |
| :--- | :--- | :--- |
| ADMIN | `admin@vacinei.com.br` | |
| PROFISSIONAL_SAUDE | `mariana.costa@vacinei.com.br` | ENFERMEIRO, COREN 123456/AL, **verificada**. Caderneta com 3 registros MANUAL/OCR |
| PROFISSIONAL_SAUDE | `paulo.ribeiro@vacinei.com.br` | TECNICO_ENFERMAGEM, COREN 654321/AL, **pendente** de verificação. Caderneta com 2 doses confirmadas pela Mariana e 1 MANUAL |
| CIDADAO | `carlos.souza@vacinei.com.br` | 2 dependentes sem doses (Enzo e Valentina) |
| CIDADAO | `cidadao01@vacinei.com.br` | Ana Beatriz Lima. 3 dependentes: Miguel (bebê com doses **atrasadas**), Helena (2 vacinas **aguardando conferência**) e Ruth (curatelada de 80 anos, 1 vacina aguardando conferência) |
| CIDADAO | `cidadao02@vacinei.com.br` | João Pedro Araújo. 2 dependentes: Laura (criança com reforço atrasado e 1 vacina aguardando conferência) e Pedro Henrique (adolescente) |
| CIDADAO | `cidadao03@vacinei.com.br` … `cidadao25@vacinei.com.br` | com registros de vacinação |

Dependentes não fazem login: o responsável acessa os dados deles em `/dependents` (D33).

## Convenções

- **Auth:** header `Authorization: Bearer <token>`. O access token vale 15 min. Para renovar, use `POST /auth/refresh`.
- **Sucesso:** `{ "status": "success", "data": ... }`. Algumas rotas respondem `{ "status": "success", "message": "..." }`.
- **Erro:** `{ "status": "error", "message": "..." }`. Algumas rotas incluem `code`, um código estável para o cliente tratar o erro sem depender do texto (ex.: `OCR_TIMEOUT`).
- **Erro de validação (400):** inclui `issues` com os erros por campo (formato `ZodError.format()`).
- **Erros comuns a toda rota autenticada:**
  - `401`: token ausente, inválido ou expirado, ou usuário desativado (o bloqueio vale na hora, mesmo com token ainda no prazo).
  - `403`: o perfil não tem permissão.
- **Profissional verificado:** perfil `PROFISSIONAL_SAUDE`, conta ativa e registro com `isVerified = true`. Se não atender, a rota responde `403`.
- **Regra de senha (RF001):** mínimo de 8 caracteres, com ao menos 1 maiúscula, 1 minúscula, 1 número e 1 símbolo.
- **Acesso:** `Público` = sem token; `Autenticado` = qualquer perfil logado.
- **Paginação (D22):** `GET /users`, `GET /professionals` e `GET /dashboard/overdue` aceitam `?page=` (padrão 1) e `?limit=` (padrão 20, máximo 100) e respondem `data: { items, total, page, limit, totalPages, ... }`. `total` conta todos os resultados do filtro; `totalPages = ceil(total / limit)`. Página além da última volta `items: []`. Listas com abas de status trazem também `counts` (totais por status com os demais filtros aplicados, ignorando o filtro de status). `GET /ubs` e `GET /vaccines` não são paginados (catálogos pequenos).

---

## Sistema

| Método | Rota | Acesso | Resposta 200 |
| :--- | :--- | :--- | :--- |
| GET | `/` | Público | `{ name, version, description, status }` |
| GET | `/health` | Público | `{ status: "ok", timestamp, uptime }` |

---

## Auth (`/auth`)

### POST `/auth/login`
- **Acesso:** Público
- **Body:** `{ email, password }`
- **200:** `data: { user: { id, name, email, cpf, role, professionalRegistry }, token, refreshToken }`
  - `professionalRegistry`: `{ isVerified, status: "PENDENTE" | "VERIFICADO" | "RECUSADO" }` quando `role = PROFISSIONAL_SAUDE`. É `null` para os outros perfis.
- **Erros:**
  - `400`: validação.
  - `401`: `Credenciais inválidas.` (mensagem genérica, igual para e-mail inexistente e senha errada, inclusive em conta desativada).
  - `403`: conta desativada, **só quando a senha está correta** (D17).

### POST `/auth/refresh`
- **Acesso:** Público
- **Body:** `{ refreshToken }`
- **200:** `data: { token, refreshToken }`. Há rotação: o refresh token antigo é revogado.
- **Erros:**
  - `400`: validação.
  - `401`: refresh token não encontrado, revogado ou expirado.
  - `403`: usuário inativo.

### POST `/auth/logout`
- **Acesso:** Público (o refresh token identifica a sessão).
- **Body:** `{ refreshToken }`, o da sessão atual.
- **204:** sem corpo. Revoga o refresh token no servidor. Responde `204` mesmo se o token não existir, estiver expirado ou já revogado (D27). O cliente deve descartar o access token e o refresh token.
- **Erros:** `400` (validação).

### POST `/auth/forgot-password`
- **Acesso:** Público
- **Body:** `{ email }`
- **200:** `message: "Se o e-mail estiver cadastrado, você receberá um código de recuperação."`. A resposta é sempre igual, exista ou não a conta. O código de 6 dígitos vale 10 min e é enviado por e-mail (Ethereal).
- **Erros:** `400` (validação).

### POST `/auth/reset-password`
- **Acesso:** Público
- **Body:** `{ email, code: "123456", newPassword }`. `newPassword` segue a regra de senha.
- **200:** `message: "Senha redefinida com sucesso."`. Revoga todos os refresh tokens do usuário.
- **Erros:**
  - `400`: validação, ou `Código inválido ou expirado.`
  - `429`: 3 tentativas erradas bloqueiam por 15 min.

### GET `/auth/me`
- **Acesso:** Autenticado
- **200:** `data: { id, name, email, cpf, phone, birthDate, role, avatarUrl, isActive, createdAt, privacyConsentAt, privacyPolicyVersion, professionalRegistry, dependents: [{ id, name, birthDate, cpf, sex, relationship }] }`
  - `privacyConsentAt` (ISO 8601) e `privacyPolicyVersion` (ex: `"2026-10"`): consentimento LGPD dado no cadastro (D26). Podem ser `null` em contas antigas. Só o próprio titular vê esses campos.
  - `professionalRegistry`: mesmo formato do login, `{ isVerified, status }` para `PROFISSIONAL_SAUDE` e `null` para os outros perfis.
- **Erros:**
  - `401`: não autenticado.
  - `404`: usuário não encontrado.

### PATCH `/auth/me` (perfil, RF003)
- **Acesso:** Autenticado. Edita só o próprio usuário (id vem do token, RS002).
- **Body:** `{ name }`, com a mesma regra do cadastro. Qualquer outro campo é recusado com `400`: e-mail e celular exigem reverificação por código (futuro); CPF, data de nascimento, perfil e registro profissional não são editáveis (D19).
- **200:** `data: { id, name, email, cpf, phone, birthDate, role, avatarUrl, updatedAt }`
- **Erros:** `400`, `401`, `404`.

### PATCH `/auth/me/password`
- **Acesso:** Autenticado
- **Body:** `{ currentPassword, newPassword, refreshToken? }`. `newPassword` segue a regra de senha. `refreshToken` (opcional) é o da sessão atual, para mantê-la ativa.
- **200:** `message: "Senha alterada com sucesso."`. Revoga todos os outros refresh tokens do usuário (sem `refreshToken`, revoga todos).
- **Erros:**
  - `400`: validação, ou `A nova senha deve ser diferente da atual.`
  - `401`: `Senha atual incorreta.` (ou token inválido).
  - `404`: usuário não encontrado.

---

## Users (`/users`)

### POST `/users` (cadastro)
- **Acesso:** Público. Token opcional: com token de ADMIN, também é possível criar outro ADMIN, e o profissional criado já nasce verificado.
- **Body:** `{ name, email, password, phone, cpf, birthDate, acceptedPrivacyPolicy, role?, professionalRegistry? }` (RF001). `cpf` e `birthDate` são obrigatórios para todos os perfis (D14).
  - `acceptedPrivacyPolicy`: precisa ser `true` (`400` se ausente ou `false`). O backend grava a data/hora do aceite e a versão vigente da política (D26). Esses campos não voltam na resposta; o titular os vê em `GET /auth/me`.
  - `name`: até 120 caracteres, com nome e sobrenome (mínimo duas palavras).
  - `email`: até 100 caracteres, único.
  - `password`: segue a regra de senha.
  - `cpf`: com ou sem máscara (`529.982.247-25` ou `52998224725`), com dígitos verificadores válidos. Sequências repetidas (`111.111.111-11`) são rejeitadas. É salvo só com os 11 números e é único.
  - `phone`: celular só com números, DDD + 9 dígitos (11 dígitos, ex: `82999990002`).
  - `birthDate`: `YYYY-MM-DD` ou ISO 8601 em UTC. Precisa ser uma data existente e não pode ser futura. É usada pelo calendário vacinal (RF007).
  - `role`: `CIDADAO` (padrão) ou `PROFISSIONAL_SAUDE`. `ADMIN` só com token de ADMIN.
  - `professionalRegistry`: `{ category, registryNumber, uf? }`, obrigatório para `PROFISSIONAL_SAUDE`.
    - `category`: `MEDICO | ENFERMEIRO | TECNICO_ENFERMAGEM | AUXILIAR_ENFERMAGEM | FARMACEUTICO`.
    - O `council` **não é enviado**: o backend deriva da categoria (MEDICO → CRM; ENFERMEIRO, TECNICO_ENFERMAGEM e AUXILIAR_ENFERMAGEM → COREN; FARMACEUTICO → CRF).
    - `registryNumber`: até 20 caracteres alfanuméricos, com sufixo `-UF` opcional (ex: `123456` ou `123456-AL`). É salvo sem o sufixo.
    - `uf`: obrigatório se o número não tiver o sufixo `-UF`. Se vierem os dois, precisam ser iguais.
- **201:** `data: { id, name, email, cpf, phone, birthDate, role, avatarUrl, isActive, createdAt, professionalRegistry }`, com `cpf` só com números. O profissional criado no cadastro público nasce com `isVerified = false` e fica pendente de verificação pelo admin. Se quem cria é um ADMIN, ele nasce com `isVerified = true`, `verifiedAt` = agora e `verifiedById` = id do admin.
- **Erros:**
  - `400`: validação, inclusive senha fraca, CPF inválido, data de nascimento futura e Política de Privacidade não aceita.
  - `401`: token enviado, mas inválido.
  - `403`: `Apenas administradores podem criar contas de administrador.`
  - `409`: e-mail, CPF ou registro profissional já cadastrado.

### GET `/users`
- **Acesso:** ADMIN
- **Query:** `role?`, `isActive?` (`true`/`false`), `search?` (nome, e-mail ou CPF, com ou sem máscara), `page?` (padrão 1), `limit?` (padrão 20, máximo 100). Filtros aplicados no banco.
- **200:** `data: { items: [{ id, name, email, cpf: "***.123.456-**", phone, role, isActive, createdAt, professionalRegistry }], total, page, limit, totalPages, counts: { active, inactive } }`. Ordenado do mais recente. CPF sempre mascarado. `counts` respeita `role` e `search`, mas não `isActive`. Dependentes não são contas e não aparecem (D33), então `email` vem sempre preenchido.
- **Erros:** `400`, `401`, `403`.

### GET `/users/me` · GET `/users/:id`
- **Acesso:** Autenticado. O usuário só consulta a si mesmo; ADMIN consulta qualquer um.
- **200:** `data: { id, name, email, cpf, phone, birthDate, role, avatarUrl, isActive, createdAt, updatedAt, professionalRegistry, dependents: [{ id, name, birthDate, cpf, sex, relationship }] }`. O CPF (do usuário e dos dependentes) vem completo só para o próprio titular. Quando o ADMIN consulta outra pessoa, ele vem mascarado.
- **Erros:** `401`, `403`, `404` (inclusive para o id de um dependente: `PUT` e `DELETE /users/:id` também respondem `404` para dependentes).

### PUT `/users/:id`
- **Acesso:** ADMIN (alterações administrativas, RF003 nota 5). O usuário edita o próprio perfil por `PATCH /auth/me`; o `PUT /users/me` foi removido (D20).
- **Body:** todos os campos são opcionais: `{ name?, phone?, birthDate?, avatarUrl?, isActive? }`. `name`, `phone` e `birthDate` seguem as mesmas regras do cadastro. Senha e CPF não são alterados por esta rota. Com `isActive: false`, as sessões do usuário são revogadas, como no `DELETE`.
- **200:** `data: { id, name, email, cpf, phone, birthDate, role, avatarUrl, isActive, updatedAt }`. O CPF vem mascarado quando o ADMIN edita outra pessoa.
- **Erros:** `400`, `401`, `403`, `404`.

### DELETE `/users/me` · DELETE `/users/:id`
- **Acesso:** Autenticado. O usuário só desativa a si mesmo; ADMIN desativa qualquer um.
- **200:** `data: { message: "Conta de usuário desativada com sucesso." }`. É uma exclusão lógica (`isActive = false`) e revoga as sessões do usuário.
- **Erros:** `401`, `403`, `404`.

---

## Professionals (`/professionals`): verificação manual (RS001)

Todas as rotas exigem **ADMIN**. `:id` é o id do **usuário** profissional.

Objeto `Professional`:
```json
{
  "id": "uuid", "name": "...", "email": "...", "isActive": true, "createdAt": "ISO",
  "category": "TECNICO_ENFERMAGEM",
  "registry": { "council": "COREN", "registryNumber": "654321", "uf": "AL" },
  "isVerified": false,
  "verificationStatus": "PENDENTE | VERIFICADO | RECUSADO",
  "verifiedAt": null, "verifiedBy": { "id": "uuid", "name": "..." },
  "rejectedAt": null, "rejectedBy": { "id": "uuid", "name": "..." },
  "rejectionReason": null
}
```

### GET `/professionals`
- **Query:** `status?` (`PENDENTE`, `VERIFICADO` ou `RECUSADO`; sem ele, todos), `search?` (nome, sem diferenciar maiúsculas), `page?` (padrão 1), `limit?` (padrão 20, máximo 100). Filtros aplicados no banco. O antigo `verified` foi substituído por `status`.
- **200:** `data: { items: Professional[], total, page, limit, totalPages, counts: { PENDENTE, VERIFICADO, RECUSADO } }`, ordenado por data de cadastro. `counts` respeita `search`, mas não `status`.
- **Erros:** `400` (`status`, `page` ou `limit` inválidos), `401`, `403`.

### PATCH `/professionals/:id/verify`
- **Body:** nenhum
- **200:** `data: Professional`. Grava `isVerified = true`, `verifiedAt`, `verifiedBy` e limpa os dados de recusa.
- **Erros:**
  - `400`: id não é UUID.
  - `401`, `403`.
  - `404`: profissional não encontrado.
  - `409`: já verificado.

### PATCH `/professionals/:id/reject`
- **Body:** `{ reason? }` (3 a 500 caracteres)
- **200:** `data: Professional` com `verificationStatus: "RECUSADO"`.
  - A conta **continua ativa**, mas sem verificação, então as rotas de profissional verificado respondem 403.
  - Se o profissional já estava verificado, a verificação é revogada.
  - Para bloquear o acesso, use `DELETE /users/:id`.
- **Erros:**
  - `400`: validação.
  - `401`, `403`.
  - `404`: profissional não encontrado.
  - `409`: recusa já registrada.

---

## Citizens (`/citizens`)

"Cidadão" aqui inclui usuários ativos com perfil `CIDADAO` **ou** `PROFISSIONAL_SAUDE`: o profissional também tem caderneta (D11). Os dependentes (D33) também entram. `ADMIN` fica de fora.

### GET `/citizens`
- **Acesso:** Profissional verificado
- **Query:** `search` (2 a 100 caracteres). Se o termo for um CPF completo (11 dígitos, com ou sem máscara), a busca é pelo CPF exato. Senão, a busca é por nome, ignorando acentos e maiúsculas (RF010 nota 1).
  - Busca pelo CPF de um responsável traz ele **e todos os seus dependentes** (a criança muitas vezes não tem CPF).
- **200:** `data: [{ id, name, birthDate, cpf: "***.123.456-**", role, responsible: { id, name } | null }]`. Retorna no máximo 20 usuários ativos (`CIDADAO` ou `PROFISSIONAL_SAUDE`), com CPF mascarado. `responsible` vem preenchido quando a pessoa é dependente; titulares vêm antes dos dependentes. Dependente sem CPF vem com `cpf: null`.
- **Erros:** `400`, `401`, `403`.

### GET `/citizens/:id/vaccination-records` (caderneta)
- **Acesso:** o próprio cidadão (titular), o responsável, quando `:id` é dependente dele (D33), ou profissional verificado
- **200:**
  ```
  data: {
    citizen: { id, name, birthDate, responsible: { id, name } | null },
    summary: { totalVaccines, emDia, atrasadas, completas },
    vaccines: [{
      vaccine: { id, name, targetDisease, dosesCount },
      status: EM_DIA | ATRASADA | COMPLETA,
      appliedDoses, totalDoses, lastDose, nextDose, nextDoseDate,
      alert: {
        status: ATRASADA | AGUARDANDO_CONFERENCIA | EM_DIA | COMPLETA,
        pendingDoses: [{ id, doseNumber, doseName, applicationDate }]
      },
      records: [{ id, status, origin, applicationDate, lotNumber, dose, ubs, appliedBy }]
    }]
  }
  ```
- **`status` × `alert`:** o `status` (e o `summary`) contam todo registro como dose aplicada, confirmado ou não, e dão a próxima dose (`nextDose`/`nextDoseDate`). O `alert` segue o D32 (RF007 nota 7): só a dose confirmada encerra a pendência. `ATRASADA` quando há dose vencida sem nenhum registro; senão, `AGUARDANDO_CONFERENCIA` quando há doses informadas não confirmadas (`pendingDoses`, sem dias de atraso); senão, o `status`. Uma vacina `ATRASADA` também pode ter `pendingDoses`. É o campo usado pelos alertas do app.
- **Erros:**
  - `400`: id não é UUID.
  - `401`.
  - `403`: `Acesso negado à caderneta deste cidadão.`
  - `404`: cidadão não encontrado.

---

## Vaccination records (`/vaccination-records`)

No registro, `status` diferente de `CONFIRMADO` (hoje sempre `EM_DIA`) significa **aguardando confirmação** (D30).

### POST `/vaccination-records` (cadastro manual, RF005)
- **Acesso:** `CIDADAO` ou `PROFISSIONAL_SAUDE` (verificado ou não). O registro vai sempre para a caderneta do usuário logado (id do token).
- **Body:** `{ vaccineId, doseId, applicationDate, lote?, origin?, ocrConfidence? }`.
  - `applicationDate`: `YYYY-MM-DD` ou ISO 8601. Não pode ser futura nem anterior à data de nascimento do usuário.
  - `lote`: opcional. Mesma regra do confirm: de 1 a 20 caracteres alfanuméricos, salvo em maiúsculas.
  - `origin`: opcional, `"MANUAL"` (padrão) ou `"OCR_ICR"`. Use `"OCR_ICR"` ao salvar uma dose sugerida por `POST /vaccination-records/ocr` e conferida pelo cidadão (D34). As regras são as mesmas e o registro também fica aguardando confirmação.
  - `ocrConfidence`: opcional, número de 0 a 1 (o `ocrConfidence` da sugestão). Só é gravado com `origin: "OCR_ICR"`.
- **201:** `data: { record: { id, userId, status: "EM_DIA", origin, ocrConfidence, applicationDate, lotNumber, dose: { id, doseNumber, doseName, vaccine: { id, name } }, createdAt, updatedAt }, vaccineStatus }`. O registro aparece na caderneta e no dashboard aguardando confirmação. Quando confirmado em `/confirm`, a resposta traz `action: "CONFIRMED_EXISTING"`.
- **Erros:**
  - `400`: validação, data futura ou anterior ao nascimento, ou a dose não pertence à vacina.
  - `401`.
  - `403`: perfil `ADMIN`.
  - `404`: vacina não encontrada ou inativa.
  - `409`: `Esta dose já está registrada nesta caderneta.`

### PUT `/vaccination-records/:id` (edição pelo titular)
- **Acesso:** mesmo do `POST`. Só o titular, e só enquanto o registro não estiver `CONFIRMADO`.
- **Body:** o mesmo do `POST`. A edição substitui o registro: se o `lote` for omitido, ele fica nulo. `origin` e `ocrConfidence` só mudam se `origin` for enviado. Ex.: enviar `"MANUAL"` ao editar uma dose vinda do OCR limpa o `ocrConfidence`.
- **200:** mesmo formato do `POST`.
- **Erros:**
  - `400`, `401`.
  - `403`: `Acesso negado a este registro de vacinação.` (registro de outra pessoa; registro de dependente se edita por `/dependents/:id/vaccination-records/:recordId`) ou `Registros confirmados por um profissional não podem ser alterados.`
  - `404`: registro, vacina ou dose não encontrados.
  - `409`: a nova dose já existe em outro registro da caderneta.

### DELETE `/vaccination-records/:id` (exclusão pelo titular)
- **Acesso e regras:** mesmos do `PUT`.
- **204:** sem corpo.
- **Erros:** `400` (id não é UUID), `401`, `403` (mesmas mensagens do `PUT`), `404`.

### POST `/vaccination-records/ocr` (leitura da caderneta por foto, RF004)
Lê a foto de uma caderneta física e **sugere** as doses. **Não cria registros**: o cidadão confere cada sugestão e salva pelas rotas de cadastro manual, com `origin: "OCR_ICR"` (D34). Serve para a caderneta do titular e para a dos dependentes, porque a rota de salvamento é que define de quem é a dose.

- **Acesso:** `CIDADAO` ou `PROFISSIONAL_SAUDE`.
- **Requisição:** `multipart/form-data` com **um** arquivo no campo `image`. Aceita JPEG ou PNG de até 8 MB (`OCR_MAX_IMAGE_MB`).
  - **O que fotografar:** a página inteira (ou as duas páginas abertas), de frente, com luz uniforme e sem cortar as bordas da tabela.
  - **LGPD:** a imagem é processada em memória e descartada. Nunca é salva nem registrada em log.
  - **Tempo:** o backend espera o serviço de OCR por até 20 s (`OCR_TIMEOUT_MS`). Hoje leva de 2 a 5 s.
- **Modelos reconhecidos (D34):**

  | `model.id` | Caderneta |
  | :--- | :--- |
  | `caderneta-crianca-ms` | Caderneta da Criança (Ministério da Saúde): tabelas "até 12 meses" e "a partir de 12 meses" |
  | `caderneta-maceio-jovens-adultos` | Caderneta de Vacinação de Jovens e Adultos (Prefeitura de Maceió): blocos impressos e 16 blocos livres |

- **200:**
  ```json
  {
    "status": "success",
    "data": {
      "model": { "id": "caderneta-maceio-jovens-adultos", "name": "Caderneta de Vacinação de Jovens e Adultos (Prefeitura de Maceió)" },
      "manualFallback": false,
      "fallbackReason": null,
      "alignment": [{ "page": "principal", "quality": "BOA" }],
      "cellsChecked": 32,
      "doses": [
        {
          "cellId": "principal-20",
          "kind": "FIXED",
          "printedLabel": "Meningo. ACWY · Reforço",
          "vaccine": { "id": "a2894ebb-…", "name": "Meningocócica ACWY", "source": "TEMPLATE", "confidence": 1, "crop": null },
          "dose": { "id": "5d1c…", "doseNumber": 1, "name": "Reforço (11 a 14 anos)", "printedLabel": "Reforço" },
          "applicationDate": { "value": "2026-01-31", "confidence": 0.82, "crop": "data:image/png;base64,iVBORw0…" },
          "lote": { "value": null, "confidence": 0.21, "crop": "data:image/png;base64,iVBORw0…" },
          "cellCrop": "data:image/png;base64,iVBORw0…",
          "ocrConfidence": 0.82
        }
      ]
    }
  }
  ```
- **Campos de `data`:**
  - **`model`:** modelo reconhecido, ou `null`.
  - **`manualFallback`:** `true` quando não há nada para revisar. O app deve oferecer o cadastro manual.
  - **`fallbackReason`:** `"MODELO_NAO_RECONHECIDO"` (foto de outro modelo, ruim ou cortada: `model: null`), `"NENHUMA_DOSE_ENCONTRADA"` (modelo reconhecido, mas nenhuma célula preenchida) ou `null`.
  - **`alignment[]`:** qualidade do alinhamento de cada página reconhecida (`BOA`, `RAZOAVEL`, `BAIXA`). Com `BAIXA`, vale sugerir uma nova foto.
  - **`cellsChecked`:** quantas células do modelo apareceram na foto e foram verificadas.
  - **`doses[]`:** uma sugestão por célula preenchida, na ordem da caderneta.
- **Campos de cada dose:**
  - **`cellId` / `printedLabel`:** posição no modelo e o que está impresso nela. Em bloco livre, `"Bloco livre"`.
  - **`kind`:** `"FIXED"` (vacina e dose impressas) ou `"FREE"` (bloco em que a vacina é escrita à mão).
  - **`vaccine`:** `{ id, name, source, confidence, crop }`.
    - Em `FIXED`, vem da posição da célula (`source: "TEMPLATE"`, `confidence: 1`, `crop: null`).
    - Em `FREE`, vem do OCR (`source: "OCR"`) com o recorte do campo VACINA. Se não casar com nenhuma vacina do catálogo, `id` e `name` são `null`.
  - **`dose`:** `{ id, doseNumber, name, printedLabel }`. `id` é o `doseId` do catálogo. Fica `null` quando a dose impressa não tem correspondente no catálogo (ex.: Hepatite B 2ª dose do adulto, HPV 2ª dose) e sempre em `FREE`. Nesses casos, o cidadão escolhe a dose na revisão.
  - **`applicationDate`:** `{ value, confidence, crop }`. `value` em `YYYY-MM-DD`, ou `null` se a leitura teve baixa confiança, não é uma data válida ou é futura.
  - **`lote`:** `{ value, confidence, crop }`. `value` em maiúsculas (1 a 20 alfanuméricos), ou `null` na mesma situação.
  - **`cellCrop`:** recorte da célula inteira.
  - **`ocrConfidence`:** menor confiança (0 a 1) entre os campos que o OCR de fato sugeriu; `0` se não sugeriu nenhum. Envie esse valor ao salvar com `origin: "OCR_ICR"`.
  - **Recortes (`crop`, `cellCrop`):** PNG em escala de cinza, como data URI (`data:image/png;base64,...`), pronto para `<Image source={{ uri }} />`.
- **Fluxo no app:**
  1. O cidadão escolhe de quem é a caderneta (ele ou um dependente) e tira a foto.
  2. O app chama esta rota. Se vier erro ou `manualFallback: true`, abre o cadastro manual com a mensagem correspondente.
  3. **Revisão:** cada dose aparece com `cellCrop` e o recorte de cada campo. Os campos com `value` vêm preenchidos e os com `null` ficam vazios para o cidadão digitar olhando o recorte. Vacina e dose sem `id` são escolhidas na lista do catálogo (`GET /vaccines`). O cidadão pode descartar sugestões.
  4. Cada dose confirmada é salva com `POST /vaccination-records` (titular) ou `POST /dependents/:id/vaccination-records` (dependente), com `{ vaccineId, doseId, applicationDate, lote?, origin: "OCR_ICR", ocrConfidence }`. Dose já registrada responde `409` e pode ser ignorada.
- **Erros** (todos com `code`; em qualquer um deles, o app cai no cadastro manual, RNF12):

  | Status | `code` | Quando |
  | :--- | :--- | :--- |
  | `400` | `IMAGEM_AUSENTE` | Nenhum arquivo no campo `image` |
  | `400` | `UPLOAD_INVALIDO` | Mais de um arquivo ou campo com outro nome |
  | `413` | `IMAGEM_GRANDE` | Arquivo maior que o limite |
  | `415` | `FORMATO_INVALIDO` | Arquivo que não é JPEG nem PNG |
  | `422` | `IMAGEM_INVALIDA` | Arquivo que não abre como imagem |
  | `502` | `OCR_ERRO` | O serviço de OCR respondeu com erro |
  | `503` | `OCR_INDISPONIVEL` | O serviço de OCR está fora do ar |
  | `504` | `OCR_TIMEOUT` | O serviço de OCR passou do tempo limite |

  Também `401`, e `403` para o perfil `ADMIN`.
- **Limitação atual:** o motor de OCR (Tesseract) quase não reconhece escrita à mão. Hoje a rota identifica o modelo e encontra as células preenchidas (vacina e dose dos blocos impressos vêm certas pela posição), mas data, lote e vacina manuscrita costumam vir `null` com o recorte. O contrato não muda quando o motor for trocado (D34).

### POST `/vaccination-records/confirm` (confirmação presencial, RF010)
- **Acesso:** Profissional verificado. O profissional aplicador vem da sessão.
- **Body:** `{ citizenId, vaccineId, doseId, lote }`. `citizenId` pode ser de um `CIDADAO`, de outro `PROFISSIONAL_SAUDE` ou de um dependente (D33). `lote` tem 1 a 20 caracteres alfanuméricos e é salvo em maiúsculas.
- **201:** dose nova registrada (`action: "CREATED"`).
- **200:** registro manual/OCR já existente, promovido a `CONFIRMADO` (`action: "CONFIRMED_EXISTING"`).
- **Body da resposta (201 e 200):** `data: { action, record: { id, userId, status, origin, applicationDate, confirmedAt, lotNumber, dose, appliedBy, ... }, vaccineStatus }`
- **Erros:**
  - `400`: validação, ou a dose não pertence à vacina.
  - `401`, `403`.
  - `403`: `Não é permitido confirmar a própria vacinação` (`citizenId` igual ao usuário logado, RS006).
  - `403`: `Não é permitido confirmar a vacinação dos próprios dependentes` (RS006, D33).
  - `404`: cidadão ou vacina não encontrados.
  - `409`: dose já confirmada.

---

## Dependents (`/dependents`): dependentes do usuário logado (RF012, RS004, RS008)

Todas as rotas exigem token de `CIDADAO` ou `PROFISSIONAL_SAUDE` (o profissional também pode ser responsável, D11). O responsável vem sempre do token. O dependente é um cidadão **sem login** (sem e-mail e senha) ligado ao responsável (D33).

- **RS004:** só o responsável acessa por estas rotas. O id de um dependente de outra pessoa, ou de alguém que não é dependente, responde **`404 Dependente não encontrado.`**, sem revelar se o cadastro existe. O profissional verificado acessa a caderneta pelas rotas de `/citizens` e confirma doses pelo `/vaccination-records/confirm`.

Objeto `Dependent`: `{ id, name, birthDate, cpf, sex, relationship, createdAt, updatedAt }`. O CPF vem completo, porque o responsável é o titular desses dados (D14).

### GET `/dependents`
- **200:** `data: Dependent[]`, do mais novo para o mais velho.

### POST `/dependents`
- **Body:** `{ name, birthDate, sex, cpf?, relationship? }`
  - `name`: mesma regra do cadastro (nome e sobrenome, até 120 caracteres).
  - `birthDate`: `YYYY-MM-DD` ou ISO 8601, nunca futura.
  - `sex`: `MASCULINO` ou `FEMININO`.
  - `cpf`: opcional, com ou sem máscara, validado pelos dígitos verificadores. Vazio ou `null` = sem CPF.
  - `relationship`: opcional. `FILHO`, `PAI_MAE`, `CONJUGE`, `CURATELADO` ou `OUTRO`.
  - **Idade (ECA):** o dependente precisa ter **menos de 18 anos**, exceto com `relationship: "CURATELADO"`, que aceita qualquer idade.
- **201:** `data: Dependent`
- **Erros:**
  - `400`: validação, data futura ou `O dependente deve ter menos de 18 anos. Maiores de idade só podem ser cadastrados com o parentesco CURATELADO.`
  - `401`, `403` (perfil `ADMIN`).
  - `409`: `Já existe uma pessoa cadastrada com este CPF.` (em qualquer usuário, inclusive titulares) ou `Você já cadastrou um dependente com este nome e data de nascimento.` (RS008; nome comparado sem acentos, maiúsculas e espaços extras).

### GET `/dependents/:id`
- **200:** `data: Dependent`
- **Erros:** `400` (id não é UUID), `401`, `403`, `404`.

### PUT `/dependents/:id`
- **Body:** o mesmo do `POST`. Substitui os dados básicos: `cpf` ou `relationship` omitidos ficam nulos.
- A regra de idade só é reavaliada quando `birthDate` ou `relationship` mudam: um dependente que completou 18 anos continua editável normalmente.
- **200:** `data: Dependent`
- **Erros:** os do `POST`, `404` e `400` `A data de nascimento não pode ser posterior a uma dose já registrada na caderneta.`

### DELETE `/dependents/:id`
- **204:** sem corpo. Remove o dependente e os registros ainda **não confirmados**.
- **Erros:** `400`, `401`, `403`, `404` e `409` `Este dependente possui doses confirmadas por um profissional e não pode ser removido.`

### Caderneta e registro manual do dependente
Mesmas regras e respostas da caderneta e do registro manual do titular (D30, D32), com `:id` = dependente:

| Método | Rota | Equivale a |
| :--- | :--- | :--- |
| GET | `/dependents/:id/vaccination-records` | `GET /citizens/:id/vaccination-records` (com `citizen.responsible` preenchido) |
| POST | `/dependents/:id/vaccination-records` | `POST /vaccination-records`. A data não pode ser anterior ao nascimento **do dependente** |
| PUT | `/dependents/:id/vaccination-records/:recordId` | `PUT /vaccination-records/:id` |
| DELETE | `/dependents/:id/vaccination-records/:recordId` | `DELETE /vaccination-records/:id` |

- **Erros adicionais:** `404 Dependente não encontrado.` (RS004). Registro que não é da caderneta do dependente responde `403 Acesso negado a este registro de vacinação.`

---

## Vaccines (`/vaccines`)

### GET `/vaccines`
- **Acesso:** Público
- **Query:** `targetAudience?` (`CRIANCA|ADOLESCENTE|ADULTO|IDOSO|GESTANTE|ESPECIAL`), `search?`, `isActive?` (padrão `true`)
- **200:** `data: Vaccine[]`, com `doses[]` ordenadas. `aliases[]` traz siglas e nomes populares (ex.: `ACWY`, `MENACWY`), usados no match do OCR (D34). Hoje são definidos só pelo seed.
- **Erros:** `400`.

### GET `/vaccines/:id`
- **Acesso:** Público
- **200:** `data: Vaccine`, com `doses[]`.
- **Erros:** `404`.

### POST `/vaccines`
- **Acesso:** ADMIN
- **Body:** `{ name, description?, targetAudience?, targetDisease, dosesCount, doses?: [{ doseNumber, doseName, recommendedAgeMonths?, intervalDaysFromPrevious?, description? }] }`
- **201:** `data: Vaccine`
- **Erros:** `400`, `401`, `403`, `409` (nome duplicado).

### PUT `/vaccines/:id`
- **Acesso:** ADMIN
- **Body:** campos opcionais `{ name?, description?, targetAudience?, targetDisease?, dosesCount?, isActive? }`
- **200:** `data: Vaccine`
- **Erros:** `400`, `401`, `403`, `404`, `409`.

### DELETE `/vaccines/:id`
- **Acesso:** ADMIN
- **200:** `data: { message }`. Se a vacina já tem registros de aplicação, é desativada (exclusão lógica); se não tem, é removida.
- **Erros:** `401`, `403`, `404`.

---

## UBS (`/ubs`)

UBS **nunca é excluída**: quem deixa de existir é desativada, para preservar o histórico de vacinação (D10).

Objeto `Ubs`: `{ id, cnes, name, zipCode, address (logradouro), number, neighborhood, city, state, latitude, longitude, phone, openingHours, isActive, createdAt, updatedAt }`

### GET `/ubs`
- **Acesso:** Público. Token opcional.
- **Query:** `search?`, `city?`, `state?`, `latitude?`, `longitude?`, `radiusKm?` (padrão 15), `includeInactive?` (`true|false`, padrão `false`)
- **200:** `data: Ubs[]`, **só as ativas**. `includeInactive=true` inclui as desativadas apenas com token de ADMIN; para os demais, é ignorado. Se `latitude` e `longitude` forem enviadas, cada UBS traz `distanceKm`, a lista é filtrada pelo raio e ordenada pela distância.
- **Erros:** `400`, `401` (token enviado, mas inválido).

### GET `/ubs/:id`
- **Acesso:** Público
- **200:** `data: Ubs`, com `_count: { vaccinationRecords, campaigns }`.
- **Erros:** `404`.

### POST `/ubs`
- **Acesso:** ADMIN
- **Body (RF008):** `{ name, zipCode, address, number, neighborhood, city, state (UF), latitude, longitude, openingHours, phone?, cnes? }`
  - `zipCode`: 8 dígitos, com ou sem hífen. É salvo como `00000-000`.
  - `address`: logradouro. `number`: número do endereço, ou `"s/n"`.
  - `openingHours`: padrão do Gerenciador Web. Faixas separadas por `" · "`, cada uma no formato `"<dias>: HH:MM às HH:MM"`. Dias: `Seg`, `Ter`, `Qua`, `Qui`, `Sex`, `Sáb`, `Dom`. Dias consecutivos são agrupados (`"Seg a Sex"`) e dias soltos são separados por vírgula (`"Seg, Qua"`). Fora do padrão retorna `400`.
    - Ex: `"Seg a Sex: 07:00 às 17:00 · Sáb: 07:00 às 14:00"`
- **201:** `data: Ubs` (nasce ativa)
- **Erros:** `400`, `401`, `403`, `409` (CNES duplicado).

### PUT `/ubs/:id`
- **Acesso:** ADMIN
- **Body:** os mesmos campos do POST, todos opcionais. A ativação é feita só pelo `PATCH /ubs/:id/status`.
- **200:** `data: Ubs`
- **Erros:** `400`, `401`, `403`, `404`, `409`.

### PATCH `/ubs/:id/status`
- **Acesso:** ADMIN
- **Body:** `{ isActive: boolean }`. `false` desativa (UBS fechada) e `true` reativa.
- **200:** `data: Ubs`
- **Erros:** `400`, `401`, `403`, `404`.

---

## Dashboard (`/dashboard`): painel do profissional (RF009)

`/summary` e `/monthly` são dados agregados e aceitam **ADMIN** ou **profissional verificado**. `/recent-doses` e `/overdue` identificam cidadãos com dados de saúde e exigem **profissional verificado** (LGPD, princípio da necessidade). Os dados consideram as cadernetas de usuários ativos `CIDADAO` e `PROFISSIONAL_SAUDE` (D11), incluindo os dependentes (D33).

| Método | Rota | Query | Resposta 200 (`data`) |
| :--- | :--- | :--- | :--- |
| GET | `/dashboard/summary` | — | `{ totalCadernetas, totalVacinasRegistradas, totalDosesAtrasadas, totalDosesAguardandoConferencia }` |
| GET | `/dashboard/recent-doses` | `limit?` (1 a 50, padrão 10) | `[{ id, citizen: { id, name, responsible: { id, name } \| null }, vaccine: { id, name }, dose: { id, doseNumber, doseName }, applicationDate, status }]` |
| GET | `/dashboard/monthly` | — | `[{ month: "YYYY-MM", total }]`: últimos 12 meses, fuso America/Maceio |
| GET | `/dashboard/overdue` | `page?` (padrão 1), `limit?` (1 a 100, padrão 20), `search?` (nome), `status?` (`ATRASADA` ou `AGUARDANDO_CONFERENCIA`, padrão `ATRASADA`) | `{ items, total, page, limit, totalPages, counts, doseCounts }`, com `items: [{ id, name, cpf, responsible: { id, name } \| null, maxDaysOverdue, vaccines: [{ vaccineId, vaccineName, nextDose: { id, doseName } \| null, nextDoseDate, daysOverdue, pendingDoses: [{ id, doseName, applicationDate }] }] }]` |

- **`/summary`:** `totalDosesAtrasadas` conta as vacinas com dose vencida **sem nenhum registro** (situação `ATRASADA` do D32). `totalDosesAguardandoConferencia` conta as doses informadas pelo cidadão e ainda não confirmadas.
- **`/overdue` (busca ativa de faltosos, D21, D32):** dois grupos, escolhidos por `status`:
  - `ATRASADA`: pessoas com ao menos uma dose vencida sem nenhum registro. Ordenado por `maxDaysOverdue` (mais atrasado primeiro; empate por nome). Em cada vacina, `nextDose`, `nextDoseDate` e `daysOverdue` descrevem a dose atrasada; `pendingDoses` lista outras doses da mesma vacina aguardando conferência, se houver.
  - `AGUARDANDO_CONFERENCIA`: pessoas com doses informadas (`MANUAL`/`OCR_ICR`) e não confirmadas, por nome. `nextDose`, `nextDoseDate`, `daysOverdue` e `maxDaysOverdue` vêm `null` (não há atraso a contar: falta a conferência presencial). As doses ficam em `pendingDoses`, com a data de aplicação informada.
  - Uma vacina pode aparecer nos dois grupos, com doses diferentes.
  - `cpf` vem mascarado. `search` filtra por nome sem diferenciar maiúsculas e acentos. Paginado como as demais listas (D22). `counts` (pessoas) e `doseCounts` (doses) trazem os totais dos dois grupos com a busca aplicada, independentemente do `status`. No grupo `ATRASADA`, a dose conta uma por vacina; no `AGUARDANDO_CONFERENCIA`, conta cada dose pendente. Sem `search`, `doseCounts` é igual ao `/summary` (`totalDosesAtrasadas` e `totalDosesAguardandoConferencia`).
- **Erros:** `400` (`page`, `limit`, `search` ou `status` inválido), `401`, `403`.
