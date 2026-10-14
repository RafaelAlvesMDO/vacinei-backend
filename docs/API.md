# VACINEI!? — Contrato da API

Base URL local: `http://localhost:3333`. JSON em todas as rotas. Datas em ISO 8601.

## Logins do seed (`npx prisma db seed`)

Senha de todos: **`Vacinei@2026`**

| Perfil | E-mail | Observação |
| :--- | :--- | :--- |
| ADMIN | `admin@vacinei.com.br` | |
| PROFISSIONAL_SAUDE | `mariana.costa@vacinei.com.br` | ENFERMEIRO, COREN 123456/AL, **verificada**. Caderneta com 3 registros MANUAL/OCR |
| PROFISSIONAL_SAUDE | `paulo.ribeiro@vacinei.com.br` | TECNICO_ENFERMAGEM, COREN 654321/AL, **pendente** de verificação. Caderneta com 2 doses confirmadas pela Mariana e 1 MANUAL |
| CIDADAO | `carlos.souza@vacinei.com.br` | 2 dependentes |
| CIDADAO | `cidadao01@vacinei.com.br` … `cidadao25@vacinei.com.br` | com registros de vacinação |

## Convenções

- **Auth:** header `Authorization: Bearer <token>`. O access token vale 15 min. Para renovar, use `POST /auth/refresh`.
- **Sucesso:** `{ "status": "success", "data": ... }`. Algumas rotas respondem `{ "status": "success", "message": "..." }`.
- **Erro:** `{ "status": "error", "message": "..." }`.
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
- **200:** `data: { id, name, email, cpf, phone, birthDate, role, avatarUrl, isActive, createdAt, professionalRegistry, dependents[] }`
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
- **Body:** `{ name, email, password, phone, cpf, birthDate, role?, professionalRegistry? }` (RF001). `cpf` e `birthDate` são obrigatórios para todos os perfis (D14).
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
  - `400`: validação, inclusive senha fraca, CPF inválido e data de nascimento futura.
  - `401`: token enviado, mas inválido.
  - `403`: `Apenas administradores podem criar contas de administrador.`
  - `409`: e-mail, CPF ou registro profissional já cadastrado.

### GET `/users`
- **Acesso:** ADMIN
- **Query:** `role?`, `isActive?` (`true`/`false`), `search?` (nome, e-mail ou CPF, com ou sem máscara), `page?` (padrão 1), `limit?` (padrão 20, máximo 100). Filtros aplicados no banco.
- **200:** `data: { items: [{ id, name, email, cpf: "***.123.456-**", phone, role, isActive, createdAt, professionalRegistry }], total, page, limit, totalPages, counts: { active, inactive } }`. Ordenado do mais recente. CPF sempre mascarado. `counts` respeita `role` e `search`, mas não `isActive`.
- **Erros:** `400`, `401`, `403`.

### GET `/users/me` · GET `/users/:id`
- **Acesso:** Autenticado. O usuário só consulta a si mesmo; ADMIN consulta qualquer um.
- **200:** `data: { id, name, email, cpf, phone, birthDate, role, avatarUrl, isActive, createdAt, updatedAt, professionalRegistry, dependents[] }`. O CPF (do usuário e dos dependentes) vem completo só para o próprio titular. Quando o ADMIN consulta outra pessoa, ele vem mascarado.
- **Erros:** `401`, `403`, `404`.

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

"Cidadão" aqui inclui usuários ativos com perfil `CIDADAO` **ou** `PROFISSIONAL_SAUDE`: o profissional também tem caderneta (D11). `ADMIN` fica de fora.

### GET `/citizens`
- **Acesso:** Profissional verificado
- **Query:** `search` (2 a 100 caracteres). Se o termo for um CPF completo (11 dígitos, com ou sem máscara), a busca é pelo CPF exato. Senão, a busca é por nome, ignorando acentos e maiúsculas (RF010 nota 1).
- **200:** `data: [{ id, name, birthDate, cpf: "***.123.456-**", role }]`. Retorna no máximo 20 usuários ativos (`CIDADAO` ou `PROFISSIONAL_SAUDE`), com CPF mascarado.
- **Erros:** `400`, `401`, `403`.

### GET `/citizens/:id/vaccination-records` (caderneta)
- **Acesso:** o próprio cidadão (titular) ou profissional verificado
- **200:**
  ```
  data: {
    citizen: { id, name, birthDate },
    summary: { totalVaccines, emDia, atrasadas, completas },
    vaccines: [{
      vaccine: { id, name, targetDisease, dosesCount },
      status: EM_DIA | ATRASADA | COMPLETA,
      appliedDoses, totalDoses, lastDose, nextDose, nextDoseDate,
      records: [{ id, status, origin, applicationDate, lotNumber, dose, ubs, appliedBy }]
    }]
  }
  ```
- **Erros:**
  - `400`: id não é UUID.
  - `401`.
  - `403`: `Acesso negado à caderneta deste cidadão.`
  - `404`: cidadão não encontrado.

---

## Vaccination records (`/vaccination-records`)

### POST `/vaccination-records/confirm` (confirmação presencial, RF010)
- **Acesso:** Profissional verificado. O profissional aplicador vem da sessão.
- **Body:** `{ citizenId, vaccineId, doseId, lote }`. `citizenId` pode ser de um `CIDADAO` ou de outro `PROFISSIONAL_SAUDE`. `lote` tem 1 a 20 caracteres alfanuméricos e é salvo em maiúsculas.
- **201:** dose nova registrada (`action: "CREATED"`).
- **200:** registro manual/OCR já existente, promovido a `CONFIRMADO` (`action: "CONFIRMED_EXISTING"`).
- **Body da resposta (201 e 200):** `data: { action, record: { id, userId, status, origin, applicationDate, confirmedAt, lotNumber, dose, appliedBy, ... }, vaccineStatus }`
- **Erros:**
  - `400`: validação, ou a dose não pertence à vacina.
  - `401`, `403`.
  - `403`: `Não é permitido confirmar a própria vacinação` (`citizenId` igual ao usuário logado, RS006).
  - `404`: cidadão ou vacina não encontrados.
  - `409`: dose já confirmada.

---

## Vaccines (`/vaccines`)

### GET `/vaccines`
- **Acesso:** Público
- **Query:** `targetAudience?` (`CRIANCA|ADOLESCENTE|ADULTO|IDOSO|GESTANTE|ESPECIAL`), `search?`, `isActive?` (padrão `true`)
- **200:** `data: Vaccine[]`, com `doses[]` ordenadas.
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

`/summary` e `/monthly` são dados agregados e aceitam **ADMIN** ou **profissional verificado**. `/recent-doses` e `/overdue` identificam cidadãos com dados de saúde e exigem **profissional verificado** (LGPD, princípio da necessidade). Os dados consideram as cadernetas de usuários ativos `CIDADAO` e `PROFISSIONAL_SAUDE` (D11); dependentes ainda não entram.

| Método | Rota | Query | Resposta 200 (`data`) |
| :--- | :--- | :--- | :--- |
| GET | `/dashboard/summary` | — | `{ totalCadernetas, totalVacinasRegistradas, totalDosesAtrasadas }` |
| GET | `/dashboard/recent-doses` | `limit?` (1 a 50, padrão 10) | `[{ id, citizen: { id, name }, vaccine: { id, name }, dose: { id, doseNumber, doseName }, applicationDate, status }]` |
| GET | `/dashboard/monthly` | — | `[{ month: "YYYY-MM", total }]`: últimos 12 meses, fuso America/Maceio |
| GET | `/dashboard/overdue` | `page?` (padrão 1), `limit?` (1 a 100, padrão 20), `search?` (nome) | `{ items, total, page, limit, totalPages, totalPessoas, totalDosesAtrasadas }`, com `items: [{ id, name, cpf, maxDaysOverdue, overdueVaccines: [{ vaccineId, vaccineName, nextDose: { id, doseName }, nextDoseDate, daysOverdue }] }]` |

- **`/overdue` (busca ativa de faltosos, D21):** pessoas com ao menos uma vacina `ATRASADA`, pelo mesmo cálculo da caderneta. Ordenado por `maxDaysOverdue` (mais atrasado primeiro; empate por nome). `cpf` vem mascarado. `search` filtra por nome sem diferenciar maiúsculas e acentos. Paginado como as demais listas (D22). `totalPessoas` (igual a `total`) e `totalDosesAtrasadas` consideram todos os resultados do filtro, não só a página; sem `search`, `totalDosesAtrasadas` é igual ao do `/summary`.
- **Erros:** `400` (`page`, `limit` ou `search` inválido), `401`, `403`.
