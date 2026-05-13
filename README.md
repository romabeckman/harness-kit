# 🤖 LLM Agent Suite

A poderosa orquestração de agentes de IA para engenharia de software avançada. Este repositório contém uma coleção de **Skills Avançadas** e prompts estruturados projetados para transformar LLMs em especialistas altamente qualificados, garantindo disciplina, consistência e qualidade técnica.

---

## 🏛️ Estrutura do Suite

O projeto é focado em **Skills Especialistas** (`/skills`) que estendem as capacidades da IA para execução técnica rigorosa. Todas as skills possuem instruções em **inglês** para máxima performance dos modelos, mas são configuradas para gerar **outputs em português (pt-BR)**.

### 🛠️ Skills Avançadas (`/skills`)

| Skill | Função Principal |
| :--- | :--- |
| **Project Memory** (`project-memory`) | Gerenciamento de memória persistente e documentação técnica (README, ARCHITECTURE, TESTS). |
| **Scope Refinement** (`scope-refinement`) | Orquestrador de refinamento de escopo usando DDD (Design Estratégico e Tático). |
| **TDD Orchestrator** (`tdd-orchestrator`) | Maestro do fluxo de desenvolvimento baseado em Test-Driven Development. |
| **The Grumpy Tech Lead** (`the-grumpy-tech-lead`) | Revisão técnica crítica com foco em impactos sistêmicos e mentoria socrática. |

---

## ✨ Integração com Superpowers

Este suite foi projetado para trabalhar em harmonia com as [Superpowers Skills](https://github.com/obra/superpowers). Enquanto nossos agentes definem a estratégia, as skills do Superpowers fornecem as ferramentas de baixo nível para execução (Git, Debugging, etc.).

*   **Disciplina Operacional:** Processos rígidos para TDD, Debugging e Refinamento.
*   **Pensamento Crítico:** Uso de revisões socráticas e análise de causa raiz.
*   **Consistência:** Garante que a IA siga processos padronizados de engenharia de software.

---

## 📂 Documentação do Projeto (Setup Inicial)

A pasta `docs/` atua como a **memória persistente** do seu projeto. Ela centraliza o conhecimento técnico que permite aos agentes operar de forma autônoma e precisa.

### 🧠 Como Funciona
*   **Navegação Inteligente:** O agente decide dinamicamente qual documento ler com base na tarefa.
*   **Obrigatoriedade:** Para garantir o funcionamento das skills, os arquivos `docs/README.md`, `docs/ARCHITECTURE.md` e `docs/TESTS.md` são **obrigatórios**.

### 📝 Arquivos Base

| Arquivo | Função | Impacto no Agente |
| :--- | :--- | :--- |
| `docs/README.md` | **Sumário e Índice.** | Mapa principal para a LLM encontrar outros documentos. |
| `docs/ARCHITECTURE.md` | **Regras de Arquitetura.** | Impede decisões de design inconsistentes com o projeto. |
| `docs/TESTS.md` | **Protocolo de Qualidade.** | Define o framework e os padrões de teste do projeto. |

> [!TIP]
> Use a skill `project-memory` para gerar automaticamente a documentação base: *"Gere a documentação base para este projeto baseado na minha stack atual."*

---

## 🏗️ Fluxo de Trabalho Recomendado

1.  **Fase 1 (Escopo):** Inicie a skill `scope-refinement` para mapear o domínio e cenários de teste.
2.  **Fase 2 (Qualidade):** Utilize `the-grumpy-tech-lead` para revisar o design planejado antes de codar.
3.  **Fase 3 (Desenvolvimento):** Siga o fluxo da skill `tdd-orchestrator` para implementação garantida por testes.
4.  **Fase 4 (Documentação):** Mantenha o projeto atualizado usando `project-memory`.

---

## 🌍 Política de Idiomas

Para maximizar a precisão da IA, todas as definições internas (`SKILL.md`) estão em **Inglês**. No entanto, a interação com o usuário e a documentação gerada por essas skills serão sempre em **Português (pt-BR)**.