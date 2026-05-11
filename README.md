# 🤖 LLM Agent Suite

A poderosa orquestração de agentes de IA para engenharia de software avançada. Este repositório contém uma coleção de prompts estruturados e workflows projetados para transformar LLMs em especialistas altamente qualificados (CTO, Arquiteto, Desenvolvedor, Tester e Debugger).

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

## ✨ Superpowers Skills

Este suite foi projetado para trabalhar em harmonia com as [Superpowers Skills](https://github.com/obra/superpowers). Enquanto nossos agentes definem *quem* faz o quê, as skills do Superpowers definem *como* tarefas complexas devem ser executadas com precisão cirúrgica.

*   **Disciplina Operacional:** Workflows rígidos para TDD, Debugging e Refinamento.
*   **Pensamento Crítico:** Uso de brainstorming e revisões socráticas.
*   **Consistência:** Garante que a IA siga processos padronizados de engenharia de software.

---

## 🛠️ Instalação e Configuração

Para instalar e usar **agents** e **skills** em diferentes CLIs de IA (Claude Code CLI, Cursor e Google Gemini CLI), o processo segue uma lógica semelhante: configurar o ambiente, referenciar os arquivos de agentes e ativar os workflows.

### 1. Claude Code CLI
*   **Instalação:** Certifique-se de ter o Claude Code instalado (`npm install -g @anthropic-ai/claude-code`).
*   **Configuração:** Clone este repositório dentro do seu diretório de projeto ou em um local acessível.
*   **Ativação:** Use o comando `/add` para carregar os agentes da pasta `/agents` na sua sessão atual.

### 2. Cursor (IDE & CLI)
*   **Configuração:** Adicione os arquivos de agentes ao seu `.cursorrules` para persistência global no projeto.
*   **Uso:** Use `@` para indexar a pasta `/agents`. O Cursor usará o contexto dos arquivos markdown para guiar as respostas do chat e do Composer.

### 3. Google Gemini CLI
*   **Instalação:** Certifique-se de ter o Gemini CLI configurado com sua API Key.
*   **Configuração:** Você pode passar os arquivos de agentes como contexto inicial usando flags de arquivo ou importando-os como instruções de sistema (System Instructions).
*   **Ativação:** Utilize os prompts da pasta `/workflows` para iniciar sessões estruturadas de TDD ou DDD.

---

## 📂 Documentação do Projeto (Setup Inicial)

A pasta `docs/` atua como a **memória persistente** do seu projeto. Ela centraliza o conhecimento técnico que permite aos agentes operar de forma autônoma e precisa, consultando regras e padrões sempre que necessário.

### 🧠 Como Funciona
*   **Navegação Inteligente:** O agente decide dinamicamente qual documento ler com base na tarefa. O `docs/README.md` atua como o **sumário principal com índices**, guiando a LLM para os arquivos específicos.
*   **Obrigatoriedade:** Para garantir o funcionamento mínimo dos agentes, os arquivos `docs/README.md`, `docs/ARCHITECTURE.md` e `docs/TESTS.md` são **obrigatórios**. Qualquer outro documento adicional na pasta é opcional.

### 📝 Arquivos Base

| Arquivo | Função | Impacto no Agente |
| :--- | :--- | :--- |
| `docs/README.md` | **Sumário e Índice.** | Mapa principal para a LLM encontrar outros documentos. |
| `docs/ARCHITECTURE.md` | **Regras de Arquitetura.** | Impede decisões de design inconsistentes com o projeto. |
| `docs/TESTS.md` | **Protocolo de Qualidade.** | Define o "contrato de testes" que o Developer deve seguir. |

> [!TIP]
> Use a skill `update-docs` ou peça ao `@developer`: *"Gere a documentação base (docs/README, ARCHITECTURE e TESTS) para este projeto baseado na minha stack atual."* A skill também é excelente para **mapear projetos existentes** e documentar regras de negócio.

---

## 🚀 Como Aplicar

### Claude Code
```bash
# Exemplo: Iniciando com o CTO
claude "Usando agente cto analise meu projeto atual"
```

### Cursor
*   No Chat/Composer: `Use o agente software-architect crie um plano de design para...`

### Gemini CLI
*   Carregue o agente como instrução de sistema para manter a personalidade durante toda a conversa.

---

## 🏗️ Fluxo de Trabalho Recomendado

1.  **Fase 1 (Descoberta):** Ative o `@software-architect` para refinamento de escopo.
2.  **Fase 2 (Planejamento):** O Architect gera o plano de tarefas (Bite-sized TDD).
3.  **Fase 3 (Implementação):** O `@developer` executa as tarefas em paralelo ou sequencial.
4.  **Fase 4 (Verificação):** O `@tester` valida a entrega final.