# Guia Rápido: Conventional Commits no Projeto VACINEI!?

## Tabela de Referência

| Tipo | Descrição | Escopos Comuns | Exemplo de Mensagem |
| :--- | :--- | :--- | :--- |
| `feat` | Implementação de nova funcionalidade ou tela | `auth`, `users`, `vaccines`, `ubs`, `dependents`, `campaigns`, `reports`, `notifications` | `feat(dependents): implementa cadastro de dependentes com validação de unicidade` |
| `fix` | Correção de defeito/bug | `auth`, `users`, `vaccines`, `ubs`, `prisma`, `security` | `fix(auth): corrige expiração e revogação de refresh tokens` |
| `docs` | Alterações em documentação | `agent`, `memory`, `readme`, `swagger`, `api` | `docs(memory): atualiza registro de decisões e status pré-banca` |
| `style` | Ajustes puramente estéticos (sem alteração lógica) | `tailwind`, `layout`, `css`, `theme`, `components` | `style(tailwind): ajusta cores e badges de status da caderneta` |
| `refactor` | Refatoração de código sem alteração funcional | `services`, `repositories`, `providers`, `utils`, `types` | `refactor(services): desacopla lógica de busca geográfica para utilitário` |

## Regras de Ouro
1. **Idioma:** Sempre em Português do Brasil.
2. **Formato:** `tipo(escopo): descrição concisa`.
3. **Escopo:** Sempre em minúsculas e entre parênteses.
4. **Sem Ponto Final:** A mensagem de cabeçalho não deve terminar com ponto.
5. **Automação:** Sempre executar `git add .`, `git commit` e `git push origin main`.
