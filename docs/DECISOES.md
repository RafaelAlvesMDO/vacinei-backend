# Decisões de arquitetura e regras de negócio — VACINEI!?

Registro curto das decisões do projeto. Formato: **decisão** · motivo · requisito relacionado.
Consulte este arquivo antes de alterar qualquer regra de negócio.

## Arquitetura

### D01 — Regras de negócio centralizadas no backend
- **Decisão:** toda regra de negócio fica na API (camada de services). O painel web e o app mobile são apenas clientes e não decidem permissões, validações ou cálculos.
- **Motivo:** fonte única de verdade, consistência entre clientes e segurança (o cliente não é confiável).
- **Requisito:** arquitetura geral; RNF de segurança.

## Autenticação e perfis

### D02 — Cadastro público só para CIDADAO e PROFISSIONAL_SAUDE
- **Decisão:** o cadastro aberto aceita apenas `CIDADAO` e `PROFISSIONAL_SAUDE`. `ADMIN` só é criado por outro admin ou pelo seed.
- **Motivo:** impedir escalada de privilégio pelo endpoint público.
- **Requisito:** RBAC; RS001.

### D03 — Verificação manual de profissionais pelo admin
- **Decisão:** profissional cadastrado publicamente fica pendente até um `ADMIN` verificá-lo. Profissional criado por admin já nasce verificado. A integração com os conselhos de classe (COREN, CRM etc.) é trabalho futuro.
- **Motivo:** garantir que só profissionais reais confirmem doses, sem depender de APIs externas que não estão disponíveis no prazo do TCC.
- **Requisito:** RS001.

### D04 — Código de recuperação salvo como hash e resposta genérica
- **Decisão:** o código de 6 dígitos é guardado só como hash (10 min de validade, 3 tentativas erradas bloqueiam por 15 min). O endpoint de "esqueci a senha" sempre responde com a mesma mensagem, exista ou não a conta. O reset bem-sucedido revoga todos os refresh tokens.
- **Motivo:** vazamento do banco não expõe códigos válidos; evita enumeração de contas e força bruta.
- **Requisito:** recuperação de senha; LGPD/segurança.

## Privacidade (LGPD)

### D05 — Admin acessa só dados agregados de vacinação
- **Decisão:** o `ADMIN` vê métricas e séries agregadas (dashboard, relatórios), nunca a caderneta individual de um cidadão.
- **Motivo:** LGPD, princípio da necessidade: a função de gestão não exige dado pessoal de saúde.
- **Requisito:** relatórios/dashboard; LGPD.

## Caderneta

### D06 — Registro pelo cidadão → confirmação pelo profissional
- **Decisão:** o cidadão registra a dose (origem `MANUAL` ou `OCR_ICR`) e ela fica pendente. O profissional confirma presencialmente; a confirmação mantém a data original de aplicação e grava `confirmedAt` com o momento da confirmação.
- **Motivo:** permitir que o cidadão digitalize o histórico sem abrir mão da validação por um profissional, preservando a data real da vacina.
- **Requisito:** RF007 (nota 7), RF010.

### D07 — Influenza tratada como dose única por enquanto
- **Decisão:** a influenza é modelada como dose única. Vacinas anuais/sazonais (renovação por ciclo) são trabalho futuro.
- **Motivo:** simplifica o modelo de esquema vacinal para a entrega da pré-banca.
- **Requisito:** catálogo de vacinas/doses.

## Catálogo

### D08 — Vacinas e UBSs gerenciadas só pelo admin; leitura pública
- **Decisão:** criar, editar e remover vacinas e UBSs é exclusivo do `ADMIN`. Os `GET` são públicos.
- **Motivo:** são dados de referência públicos; a escrita precisa de controle para manter o catálogo confiável.
- **Requisito:** RF008.

## Pendências

### D09 — Dependentes ainda não implementados
- **Decisão:** o módulo de dependentes ainda não existe. Quando for implementado, as doses de dependentes devem entrar nas métricas agregadas, na busca do profissional e no fluxo de confirmação (D06).
- **Motivo:** evitar que dependentes fiquem de fora de relatórios e da validação.
- **Requisito:** módulo de dependentes.
