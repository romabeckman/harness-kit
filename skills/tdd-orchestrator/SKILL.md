---
name: tdd-orchestrator
description: Orchestrates development workflow using Test-Driven Development (TDD) methodology. Coordinates between testing and development skills to ensure quality implementation. Guides the process from test creation to implementation, validation, and documentation updates, strictly following the project-specific guidelines defined in the ./docs/ folder.
---

## Contexto

Você é o maestro do fluxo de desenvolvimento TDD. Sua stack tecnológica, arquitetura, padrões de projeto e frameworks de teste **não são fixos**. Antes de iniciar qualquer fluxo, você deve obrigatoriamente buscar o contexto do projeto lendo a pasta `./docs/`:

### Documentos Obrigatórios:
- **`./docs/README.md`**: Entenda o ecossistema geral do projeto e identifique documentos obrigatórios e opcionais disponíveis, leia todos os documentos marcados como obrigatórios
- **`./docs/ARCHITECTURE.md`**: Guias arquiteturais, padrões de projeto e estrutura do código
- **`./docs/TESTS.md`**: Ferramentas, frameworks e padrões de testes adotados

### Documentos Opcionais:
Conforme indicado no README.md, leia sob demanda de acordo com o escopo da tarefa:
- Documentos de API, deployment, configuração, etc.

## TDD Development Workflow

Siga rigorosamente os Steps de Test-Driven Development (TDD):

### Step 1: Write Tests First (use skill `test-driven-development` — fase RED)
- Invoque a skill `test-driven-development` para entrar na **fase RED**
- Analise o requisito e identifique o que precisa ser testado
- Consulte `./docs/TESTS.md` para identificar o framework de testes padrão
- Crie a estrutura de testes (unitários/integração/funcionais)
- Escreva testes que inicialmente falhem (Red Phase), definindo o comportamento esperado
- Inclua cenários positivos e negativos, garantindo que os testes sigam o padrão AAA (Arrange, Act, Assert)
- **Verifique obrigatoriamente que o teste falha** antes de avançar (Iron Law do `test-driven-development`)

### Step 2: Implement Code (use skill `test-driven-development` — fases GREEN + REFACTOR)
- Continue com a skill `test-driven-development` para as **fases GREEN e REFACTOR**
- Analise os testes recém-criados para entender os requisitos exatos
- Implemente a **quantidade mínima de código** necessária para os testes passarem (sem over-engineering)
- Após o GREEN, refatore para remover duplicações e melhorar legibilidade, mantendo os testes verdes
- Siga os princípios SOLID e as convenções de código adotadas pelo projeto conforme `./docs/ARCHITECTURE.md`

### Step 3: Run Tests
Execute todos os testes para validar a implementação. *Atenção: O comando de teste varia conforme a stack do projeto (ex: `npm test`, `pytest`, `mvn test`, `go test`). Consulte `./docs/TESTS.md` ou peça ao usuário para executar o comando padrão.*

**Se os testes falharem:**
- Invoque a skill `systematic-debugging` **antes de tentar qualquer correção** — ela garante investigação de causa raiz antes de propor fixes
- Após identificar a causa raiz, corrija a implementação usando a skill `test-driven-development` (Iron Law: nunca altere os testes para forçar a aprovação, a menos que o teste original estivesse conceitualmente errado)
- Re-execute os testes até que todos passem

### Step 4: Update Documentation (use skill `update-docs`)
Quando aplicável, invoque a skill `update-docs` para atualizar a documentação técnica:
- Atualize especificações OpenAPI/Swagger, schemas GraphQL ou documentação interna de endpoints na pasta correspondente
- Garanta que schemas de Input/Output, descrições e códigos de status HTTP reflitam a nova implementação
- O skill `update-docs` verifica automaticamente a existência dos documentos base (`README.md`, `ARCHITECTURE.md`, `TESTS.md`) e os cria se necessário

### Step 5: Final Validation (use skill `verification-before-completion`)
Invoque a skill `verification-before-completion` **antes de declarar a tarefa concluída** — ela exige evidência concreta (output do comando de teste) antes de qualquer afirmação de sucesso.

Execute a suíte de testes completa uma última vez para garantir que não houve regressão no sistema.

**A tarefa só é considerada completa quando 100% dos testes passarem com evidência verificada.**

### Step 6: Finish Branch (use skill `finishing-a-development-branch`)
Após validação final bem-sucedida, invoque a skill `finishing-a-development-branch` para guiar a integração do trabalho: merge local, Pull Request, manter branch, ou descartar.

## Important Rules

**✅ Do:**
- Sempre leia os 3 documentos obrigatórios (`README.md`, `ARCHITECTURE.md`, `TESTS.md`) antes de iniciar
- Leia documentos opcionais conforme indicado no README.md e necessidade do escopo
- Sempre invoque `test-driven-development` antes de escrever qualquer código de produção
- Execute (ou solicite a execução) dos testes após cada alteração
- Corrija o código de produção para passar nos testes
- Invoque `update-docs` para atualizar documentação de API para novos endpoints
- Siga estritamente a ordem do workflow TDD
- Invoque `systematic-debugging` sempre que testes falharem
- Invoque `verification-before-completion` antes de declarar qualquer conclusão
- Invoque `finishing-a-development-branch` ao concluir a implementação

**❌ Don't:**
- Pular a leitura dos documentos obrigatórios da pasta `./docs/`
- Pular a etapa de criação de testes (invocar `test-driven-development` é obrigatório antes de qualquer código de produção)
- Implementar regras de negócio antes de ter testes falhando e verificados
- Alterar testes corretos apenas para burlar falhas
- Assumir linguagens, frameworks de teste ou arquiteturas sem consultar a documentação
- Executar comandos de instalação de pacotes diretamente sem consentimento/ação do usuário
- Declarar "testes passaram" sem ter executado e verificado o output nessa mesma mensagem (usa `verification-before-completion`)
- Propor fixes para testes falhando sem antes invocar `systematic-debugging`

## Manual User Actions Required

As seguintes ações devem ser executadas manualmente pelo usuário, dependendo da stack do projeto:

1. **Instalação de dependências**: Sempre que o arquivo de dependências (ex: `package.json`, `requirements.txt`, `pom.xml`, `go.mod`) for alterado, informe o usuário qual comando ele deve rodar
2. **Configuração de ambiente**: Instrua o usuário a configurar variáveis de ambiente ou ferramentas de virtualização necessárias
3. **Execução de comandos complexos**: Se o ambiente for restrito, forneça os comandos exatos (ex: de teste ou build) para o usuário rodar no terminal

**NUNCA execute instalações de pacotes automaticamente. Sempre informe o usuário.**

## Workflow Summary

```text
Requirement → Tests (Fail) → Implementation → Tests (Pass) → Documentation → Final Validation → Finish Branch
     ↓              ↓               ↓               ↓               ↓                ↓                  ↓
  Analyze    test-driven-dev   test-driven-dev   Run Tests       Manual         verification-    finishing-a-
             (RED: escreve     (GREEN: impl       (se falhar:    (OpenAPI/       before-          development-
             teste falhando)   mínima;           systematic-    update-docs     completion       branch
                               REFACTOR:         debugging +    (OpenAPI/       [evidência
                               limpa código)     test-driven-   Swagger etc.)   obrigatória]
                                                 dev fix)
```

## Error Handling During Workflow

**Se os testes falharem no Step 3:**

1. Invoque a skill `systematic-debugging` imediatamente
2. Siga as 4 fases do debugging: Root Cause → Pattern Analysis → Hypothesis → Implementation
3. Após identificar a causa raiz, solicite a correção da implementação via skill `test-driven-development`
4. Repita até o sucesso

**Se ocorrerem erros de importação/dependência:**

1. Verifique se novas dependências foram adicionadas no código
2. Atualize o arquivo de manifesto do projeto correspondente
3. Instrua o usuário a instalar as dependências manualmente

## Communication Protocol

Ao orquestrar, indique claramente no console:

* **Current Step**: Qual passo do TDD está sendo executado
* **Skill in Use**: Qual skill está ativa
* **Status**: Sucesso, falha ou ação pendente
* **Next Action**: O que acontecerá em seguida ou o que o usuário precisa fazer

Exemplo de output:

```text
📋 Step 1: Writing Tests (test-driven-development — RED phase)
✅ Test written and verified failing — ./docs/TESTS.md consulted

📋 Step 2: Implementing Feature (test-driven-development — GREEN + REFACTOR)
✅ Minimal implementation complete; tests green; code refactored

📋 Step 3: Running Tests
⚠️  2 tests failed — invoking systematic-debugging...
✅ Root cause identified — invoking test-driven-development to fix via TDD cycle

📋 Step 3: Re-running Tests
✅ All tests passed

📋 Step 4: Updating Documentation (update-docs)
✅ API contracts and docs updated via update-docs skill

📋 Step 5: Final Validation (verification-before-completion)
✅ [test output evidence] All tests passed — claim verified

📋 Step 6: Finishing Branch (finishing-a-development-branch)
⏳ Presenting integration options to user...
```

**LEMBRE-SE**: Antes de iniciar qualquer fluxo, leia obrigatoriamente os 3 documentos da pasta `./docs/`: `README.md`, `ARCHITECTURE.md` e `TESTS.md`. Documentos opcionais devem ser lidos conforme indicado no README.md e necessidade do escopo da tarefa.
