# 🤖 LLM Agent Suite

A poderosa orquestração de agentes de IA para engenharia de software avançada. Este repositório contém uma coleção de prompts estruturados e workflows projetados para transformar LLMs em especialistas altamente qualificados (CTO, Arquiteto, Desenvolvedor, Tester e Debugger).

[![GitHub Repo Size](https://img.shields.io/github/repo-size/romabeckman/llm-agent-suite)](https://github.com/romabeckman/llm-agent-suite)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🏛️ Estrutura do Suite

O projeto é dividido em dois pilares principais: **Agentes Especialistas** e **Workflows de Automação**.

### 👥 Agentes Especialistas (`/agents`)
Cada agente possui um arquivo `.md` que define sua personalidade, responsabilidades e protocolos de decisão:

| Agente | Função Principal |
| :--- | :--- |
| **CTO** (`cto.md`) | Visão estratégica, orquestração de sub-agentes e validação de gates de fase. |
| **Software Architect** (`software-architect.md`) | Design de sistemas, refinamento de escopo (DDD) e planejamento de tasks. |
| **Developer** (`developer.md`) | Implementação técnica seguindo padrões de clean code e TDD. |
| **Tester** (`tester.md`) | Garantia de qualidade, criação de planos de teste e validação de cobertura. |
| **Root Cause Debugger** (`developer-debugging.md`) | Diagnóstico sistemático de bugs usando a metodologia dos "5 Whys". |

### ⚙️ Workflows de Automação (`/workflows`)
Processos estruturados que guiam os agentes em tarefas complexas:
*   **TDD Orchestrator:** Garante o ciclo Red-Green-Refactor rigoroso.
*   **DDD Refinement:** Facilita a descoberta de domínio e design tático.
*   **Project Phases:** Fluxo completo da Descoberta à Verificação em Produção.

---

## 🚀 Como Aplicar

### 🛠️ Claude Code
Para usar o suite no Claude Code, você deve referenciar os arquivos de agentes para dar o contexto necessário à ferramenta.

**Exemplo de uso:**
```bash
# Inicie o Claude Code referenciando o CTO para planejar um projeto
claude "Using context from agents/cto.md, help me plan the architecture for a new microservice"

# Dentro da sessão, adicione agentes conforme necessário
/add agents/software-architect.md
```

### 🖱️ Cursor
No Cursor, você pode integrar o suite de duas formas:

1.  **Regras de Projeto (`.cursorrules`):** Copie o conteúdo do `cto.md` (ou outro agente principal) para o arquivo `.cursorrules` na raiz do seu projeto para que o Cursor sempre siga essas diretrizes.
2.  **Referência Contextual:** Use a tecla `@` no chat para referenciar arquivos específicos:
    *   `@agents/developer.md implemente a função X seguindo o protocolo de TDD.`

### 🛸 Antigravity
Para o Antigravity, você pode configurar os agentes como instruções de projeto ou skills:

*   **Instruções de Projeto:** Adicione o caminho da pasta `/agents` nas configurações de contexto persistente.
*   **Uso de Skills:** Utilize a skill de `brainstorming` ou `writing-plans` integrada com as definições do `software-architect.md` para gerar planos de implementação precisos.

---

## 🏗️ Fluxo de Trabalho Recomendado

1.  **Fase 1 (Descoberta):** Ative o `@software-architect` para refinamento de escopo.
2.  **Fase 2 (Planejamento):** O Architect gera o plano de tarefas (Bite-sized TDD).
3.  **Fase 3 (Implementação):** O `@developer` executa as tarefas em paralelo ou sequencial.
4.  **Fase 4 (Verificação):** O `@tester` valida a entrega final.

---

## 🤝 Contribuição

Sinta-se à vontade para abrir Issues ou enviar Pull Requests com novos agentes ou melhorias nos prompts existentes.

**Mantenedor:** [Roma Beckman](https://github.com/romabeckman)
**URL do Projeto:** [https://github.com/romabeckman/llm-agent-suite](https://github.com/romabeckman/llm-agent-suite)
