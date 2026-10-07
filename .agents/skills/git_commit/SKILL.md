---
name: git_commit
description: >-
  Padroniza a criação de commits e envio de alterações para o GitHub seguindo rigorosamente a convenção Conventional Commits com mensagens em português e o fluxo de execução definido (git add ., git commit e git push origin main). Use esta skill sempre que o usuário solicitar para commitar, versionar, salvar alterações ou enviar código para o repositório GitHub.
---

# Skill: `git_commit` - Padronização de Commits para GitHub

Esta skill define as diretrizes estritas para padronização de commits e automação do fluxo de publicação no repositório GitHub do projeto.

---

## 1. Convenção Conventional Commits

Todas as mensagens de commit devem seguir rigorosamente o padrão:
```
tipo(escopo): descrição concisa
```

### 1.1. Tipos Permitidos

Apenas os seguintes tipos são autorizados:

| Tipo | Finalidade | Exemplos de Aplicação |
| :--- | :--- | :--- |
| **`feat`** | Nova funcionalidade ou tela | Criação de endpoints, controllers, interfaces de usuário, novas regras de negócio. |
| **`fix`** | Correção de bug | Correção de cálculo de doses, ajuste em validação Zod, correção de query Prisma ou erro HTTP. |
| **`docs`** | Alteração em documentação | Atualizações em `agent.md`, `memory.md`, `README.md`, OpenAPI/Swagger, etc. |
| **`style`** | Ajuste visual sem alterar lógica | Formatação CSS, classes Tailwind, ajustes de grid/layout, espaçamentos ou alinhamentos. |
| **`refactor`** | Mudança no código que não altera comportamento | Reestruturação de classes/funções, divisão de métodos, extração de helpers, melhoria de tipagens TypeScript. |

> [!IMPORTANT]
> Tipos fora desta lista (como `chore`, `perf`, `test`, `build`, `ci`) **não** são permitidos, a não ser que expressamente solicitado pelo usuário.

### 1.2. Regras para o Escopo (`escopo`)
- Deve ser escrito em **letras minúsculas** e representar o módulo, entidade ou camada impactada.
- Exemplos no Backend: `auth`, `users`, `vaccines`, `ubs`, `dependents`, `campaigns`, `prisma`, `middleware`, `docs`.
- Exemplos no Frontend: `ui`, `navbar`, `dashboard`, `auth`, `vaccines`, `layout`.
- Caso a alteração atinja múltiplos arquivos da mesma funcionalidade, priorize o nome do módulo principal.

### 1.3. Regras para a Descrição
- **Idioma:** Sempre em **português (pt-BR)**.
- **Estilo:** Descrição clara, concisa e no imperativo/infinitivo (ex: `adiciona endpoint de dependentes`, `corrige cálculo de intervalo de doses`).
- **Formatação:** Iniciar com letra minúscula após o `: ` e **sem** ponto final.
- **Limite:** Manter a linha de título sucinta (idealmente até 72 caracteres).

---

## 2. Exemplos de Mensagens Válidas

- `feat(auth): adiciona rota de refresh token com rotação no banco`
- `feat(vaccines): implementa listagem com filtro por público-alvo`
- `fix(ubs): corrige cálculo de raio de proximidade na fórmula de haversine`
- `fix(users): valida unicidade de conselho regional de saúde`
- `docs(agent): adiciona diretrizes de arquitetura multi-cliente no agent.md`
- `docs(memory): atualiza status dos cruds essenciais no memory.md`
- `docs(readme): adiciona instruções para execução dos containers docker`
- `style(tailwind): ajusta espaçamento do card de vacinas e cores de alerta`
- `style(layout): centraliza modal de confirmação de doses`
- `refactor(prisma): extrai repositórios desacoplados da camada de serviço`
- `refactor(middlewares): simplifica tratamento centralizado de exceções`

---

## 3. Fluxo Obrigatório de Execução

Ao ser solicitado um commit através desta skill, o agente deve executar os seguintes passos em sequência:

### Passo 1: Inspeção de Alterações
Antes de qualquer comando, verificar o estado do repositório:
```bash
git status
```
- Analisar as modificações (`git diff` ou lista de arquivos alterados) para determinar o `tipo` e `escopo` exatos.
- Se foram alterados apenas arquivos de documentação (`agent.md`, `memory.md`, `README.md`), o tipo **DEVE** ser `docs`.

### Passo 2: Adicionar Arquivos (Staging)
Incluir todos os arquivos modificados e criados no índice do Git:
```bash
git add .
```

### Passo 3: Criar o Commit
Executar o commit utilizando a mensagem gerada em conformidade com as diretrizes:
```bash
git commit -m "tipo(escopo): descrição concisa em português"
```

### Passo 4: Enviar para o Remoto (Push)
Publicar as alterações no branch principal (`main`) no repositório remoto:
```bash
git push origin main
```

---

## 4. Tratamento de Casos Especiais

- **Repositório Git não inicializado:** Se o diretório atual não possuir repositório Git (`fatal: not a git repository`), alertar o usuário e inicializar com `git init` ou verificar a pasta correta antes de prosseguir.
- **Remote `origin` não configurado:** Caso `git remote -v` esteja vazio, solicitar ou orientar o usuário a configurar a URL do repositório remoto no GitHub (`git remote add origin <url>`).
- **Conflito ou Rejeição de Push:** Caso o branch `main` remoto possua commits novos, realizar a sincronização (`git pull --rebase origin main`) antes de tentar o push novamente, evitando `push --force`.
- **Sem alterações:** Se `git status` retornar `nothing to commit, working tree clean`, reportar ao usuário que não há modificações pendentes para commit.
