# HarnessKit: Arquitetura em 3 Camadas

**Sistema de otimização contínua de desenvolvimento**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DESENVOLVEDOR (Você)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Dia 1: Feature de Cupom                                                   │
│  ├─ /harness-kit:project-memory          → docs/adr/ criados              │
│  ├─ /harness-kit:scope-refinement        → docs/specs/coupon-sys/        │
│  ├─ /harness-kit:tdd-orchestrator        → código + testes ✅            │
│  ├─ /harness-kit:the-grumpy-tech-lead    → 5 open-points resolvidos     │
│  └─ [automático] /harness-kit:harness-tracer → session-2026-05-22-001/ │
│                                                                             │
│  Dia 2: Bug em Validação                                                   │
│  ├─ /harness-kit:tdd-orchestrator        → teste + fix                   │
│  ├─ /harness-kit:the-grumpy-tech-lead    → 3 open-points                │
│  └─ [automático] harness-tracer → session-2026-05-22-002/               │
│                                                                             │
│  Dia 3: Cache de Cupom                                                     │
│  ├─ /harness-kit:project-memory          → REDIS-COUPON-CACHE.md        │
│  ├─ /harness-kit:tdd-orchestrator        → implementação                 │
│  ├─ /harness-kit:the-grumpy-tech-lead    → 7 open-points               │
│  └─ [automático] harness-tracer → session-2026-05-22-003/               │
│                                                                             │
│  [... mais 2 sessões ... ]                                                 │
│                                                                             │
│  Dia 8: Analisar o que aprendemos                                         │
│  ├─ /harness-kit:harness-evaluator       → Analisa 5 traces             │
│  │  Result: "early tech-lead review melhora score"                        │
│  │                                                                         │
│  ├─ /harness-kit:meta-harness            → Propõe v001 de tdd-orchestrator
│  │                                                                         │
│  └─ [Você testa v001] + harness-tracer → session-2026-05-22-006/       │
│     Result: Score 0.85 → 0.91 ✅ APROVADO                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            SKILLS (Módulos)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  📚 project-memory                                                         │
│     ├─ Detecta stack                                                      │
│     ├─ Cria/atualiza docs/ (README.md, ARCHITECTURE.md, TESTS.md)       │
│     └─ Output: Documentação estruturada em português                     │
│                                                                             │
│  🎯 scope-refinement                                                       │
│     ├─ DDD: Problem Space                                                │
│     ├─ DDD: Context Map                                                 │
│     ├─ DDD: Tactical Design                                             │
│     └─ Output: docs/specs/{dominio}/ com cenários de teste              │
│                                                                             │
│  ✅ tdd-orchestrator                                                       │
│     ├─ RED: Escreve testes que falham                                   │
│     ├─ GREEN: Implementa mínimo para passar                             │
│     ├─ REFACTOR: Limpa e melhora                                        │
│     ├─ Invoca: test-driven-development (sub-skill)                      │
│     └─ Output: Código 100% testado                                      │
│                                                                             │
│  🔍 the-grumpy-tech-lead                                                   │
│     ├─ Questiona (Socraticamente)                                       │
│     ├─ Identifica: N+1, race conditions, SOLID violations              │
│     ├─ Levanta: Open Points (sem fornecer soluções)                     │
│     └─ Output: "Você ja considerou X?"                                  │
│                                                                             │
│  📝 harness-tracer                                                         │
│     ├─ Registra: metadata.md (que skill, agent, task)                   │
│     ├─ Registra: steps.md (ações tomadas)                               │
│     ├─ Registra: score.md (métricas brutas)                             │
│     ├─ Registra: verdict.md (auto-avaliação)                            │
│     └─ Output: docs/harness-history/traces/session-*/                   │
│                                                                             │
│  📊 harness-evaluator                                                      │
│     ├─ Lê todos os traces                                               │
│     ├─ Agrupa por skill_chain                                           │
│     ├─ Calcula scores compostos                                         │
│     ├─ Identifica Pareto frontier                                       │
│     └─ Output: docs/harness-history/pareto-frontier.md                 │
│                                                                             │
│  💡 meta-harness                                                           │
│     ├─ Lê histórico completo (filesystem 𝒟)                            │
│     ├─ Diagnostica: "Por qual skill as sessões falham?"                 │
│     ├─ Propõe: UMA mudança focada na skill problemática                 │
│     ├─ Cria: candidates/vXXX/ com rationale + SKILL.md modificada      │
│     └─ Output: Candidato testável para melhoria                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    FILESYSTEM 𝒟 (Harness History)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  docs/harness-history/                                                    │
│  │                                                                        │
│  ├─ config.md                        ← Pesos de scoring                  │
│  ├─ baseline.md                      ← Configuração atual               │
│  ├─ pareto-frontier.md               ← Melhores configs                │
│  │                                                                        │
│  ├─ traces/                          ← Histórico de execução            │
│  │  ├─ session-2026-05-22-001/                                         │
│  │  │  ├─ metadata.md                skill_used: tdd-orchestrator      │
│  │  │  ├─ input.md                   task, starting state              │
│  │  │  ├─ steps.md                   ações: RED → GREEN → REFACTOR     │
│  │  │  ├─ score.md                   tdd_cycles: 3, iterations: 2     │
│  │  │  └─ verdict.md                 "Bem estruturado, mas..."         │
│  │  │                                                                    │
│  │  ├─ session-2026-05-22-002/                                         │
│  │  │  └─ [mesma estrutura]                                            │
│  │  │                                                                    │
│  │  └─ ... mais 3 sessions ...                                         │
│  │                                                                        │
│  └─ candidates/                      ← Propostas de melhoria            │
│     ├─ v001/                                                            │
│     │  ├─ rationale.md               "Por que mudamos skill X?"        │
│     │  └─ SKILL.md                   Versão modificada de tdd-orch    │
│     │                                                                    │
│     └─ v002/                         [se v001 for rejeitado]            │
│        ├─ rationale.md               Hipótese diferente               │
│        └─ SKILL.md                   Outra variação                   │
│                                                                             │
│  Exemplo métrica de score:                                               │
│  ──────────────────────────────────────────────────────────────────────   │
│  session-2026-05-22-001:                                                 │
│    tdd_cycles = 3          (3 vezes RED→GREEN→REFACTOR)                 │
│    iterations = 2          (2 corridas até tudo passar)                 │
│    grumpy_points = 5       (5 open-points levantados)                   │
│    context_docs = 3        (3 docs lidos)                               │
│    deviations = 0          (0 passos pulados)                           │
│                                                                             │
│    composite_score = (3 + 2*5 + 3) / (1 + 5 + 3) = 0.82               │
│                                                                             │
│  Pareto frontier (após evaluator):                                       │
│  ──────────────────────────────────────────────────────────────────────   │
│  Chain 1: project-memory → tdd → tech-lead                              │
│           mean_score: 0.82, best: 0.91, consistency: σ=0.8             │
│           → Recomendada para próxima sessão                             │
│                                                                             │
│  Chain 2: scope-refinement → tdd → tech-lead                            │
│           mean_score: 0.71, best: 0.84, consistency: σ=1.2             │
│           → Alternativa se contexto é arquitetural                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Fluxo de Retroalimentação (Feedback Loop)

```
FASE 1: Desenvolvimento Normal
┌──────────────────────────────────────────────────────────┐
│ Você executa tdd-orchestrator (+ outras skills)         │
│         ↓                                                │
│ harness-tracer registra tudo em traces/session-*        │
│         ↓                                                │
│ Arquivo criado com score.md (métricas brutas)          │
└──────────────────────────────────────────────────────────┘
                         ↓
FASE 2: Análise (a cada 5-10 sessões)
┌──────────────────────────────────────────────────────────┐
│ Você executa harness-evaluator                          │
│         ↓                                                │
│ Lê todos os traces/ e calcula compostos                │
│         ↓                                                │
│ Gera pareto-frontier.md (ranking de configs)           │
│         ↓                                                │
│ Identifica: "Qual skill causou as piores sessões?"    │
└──────────────────────────────────────────────────────────┘
                         ↓
FASE 3: Otimização
┌──────────────────────────────────────────────────────────┐
│ meta-harness lê histórico (filesystem 𝒟)               │
│         ↓                                                │
│ Diagnóstico: "Problema está em tdd-orchestrator"      │
│              (late tech-lead review prejudica score)   │
│         ↓                                                │
│ Propõe: candidates/v001/SKILL.md (nova versão)        │
│         ↓                                                │
│ Você testa v001 em prática                            │
│         ↓                                                │
│ harness-tracer registra resultado                      │
└──────────────────────────────────────────────────────────┘
                         ↓
FASE 4: Validação
┌──────────────────────────────────────────────────────────┐
│ harness-evaluator roda novamente                        │
│         ↓                                                │
│ Score de v001 vs baseline:                            │
│   Baseline: 0.82                                        │
│   v001: 0.91                                           │
│         ↓                                                │
│ ✅ APROVADO → v001 vira novo baseline                 │
│                                                         │
│ (ou ❌ REJEITADO → meta-harness propõe v002)         │
└──────────────────────────────────────────────────────────┘
                         ↓
Próxima sessão de desenvolvimento já usa v001 (melhorado)
```

---

## Correspondência: Conceitos ↔ Implementação

| Conceito | HarnessKit |
|---|---|
| **Objetivo**: Encontrar configuração ótima | **Goal**: Encontrar skill_chain com melhor mean_score |
| **Proposer (agente)** | `meta-harness` skill |
| **Filesystem (histórico)** | `docs/harness-history/` |
| **Leitura seletiva de histórico** | `meta-harness` lê filesystem em etapas |
| **Trace de execução** | `steps.md` em cada session |
| **Score** | `score.md` (composite score) |
| **Configuração** | SKILL.md (arquivo com instruções) |
| **População de candidatos** | Baseline skills + candidates/vXXX/ |
| **Fronteira de Pareto** | `pareto-frontier.md` |
| **Inicialização** | harness-tracer cria pasta structure |
| **Execução avaliada** | Você executa skill, registra trace |
| **Armazenamento de resultado** | harness-tracer persiste session-* |
| **Iterações** | Você executa skill múltiplas vezes |
| **Propostas** | meta-harness propõe v001, v002, ... |

---

## Exemplo de Ciclo Completo (8 Dias)

```
DIA 1 - FEATURE: Cupom de Desconto
─────────────────────────────────
Você: /harness-kit:project-memory
      /harness-kit:scope-refinement (DDD coupon context)
      /harness-kit:tdd-orchestrator (RED → GREEN → REFACTOR: 3 ciclos)
      /harness-kit:the-grumpy-tech-lead (5 open-points)
      [automático] harness-tracer
      
Score registrado: tdd_cycles=3, iterations=2, grumpy_points=5
mean_score: 0.82 ✅

DIA 2 - BUG: Validação permite cupom expirado
──────────────────────────────────────────────
Você: /harness-kit:tdd-orchestrator (RED → GREEN: 1 ciclo)
      /harness-kit:the-grumpy-tech-lead (3 open-points: cache, TTL, sincro)
      [automático] harness-tracer

Score: tdd_cycles=1, iterations=1, grumpy_points=3
mean_score: 0.85 ✅

DIA 3 - FEATURE: Cache com Redis
─────────────────────────────────
Você: /harness-kit:project-memory (cria REDIS-COUPON-CACHE.md ADR)
      /harness-kit:tdd-orchestrator (RED → GREEN → REFACTOR: 4 ciclos)
      /harness-kit:the-grumpy-tech-lead (7 open-points: fallback, sync, TTL)
      [automático] harness-tracer

Score: tdd_cycles=4, iterations=3, grumpy_points=7
mean_score: 0.78 (mais complexo, mas esperado)

DIA 4-6 - Mais sessões...
────────────────────────
[3 mais sessões com features pequenas]

media geral 5 sessões: 0.81

DIA 7 - ANÁLISE (Otimização)
────────────────────────────
Você: /harness-kit:harness-evaluator

Resultado:
  Chain: project-memory → tdd-orchestrator → the-grumpy-tech-lead
  n=5, mean=0.81, best=0.85, worst=0.78

  Hipótese from verdict.md:
  - Sessão com grumpy_points=7 (dia 3) demorou mais
  - Sessão com grumpy_points=3 (dia 2) foi rápida
  
  → Problema: Late review faz sessão vagar

Você: /harness-kit:meta-harness

Proposta v001:
  Modificar tdd-orchestrator para invocar the-grumpy-tech-lead
  APÓS primeiro ciclo (not no final)
  
Você testa v001:
  /harness-kit:tdd-orchestrator [usa v001/SKILL.md]
  Resultado: Resolveu pontos mais cedo, ciclos foram mais focados
  [automático] harness-tracer

Score de teste v001:
  tdd_cycles=3, iterations=1 (mais eficiente!), grumpy_points=4
  mean_score: 0.89 ✅ (melhoria de 0.08 pontos)

DIA 8 - VALIDAÇÃO
─────────────────
Você: /harness-kit:harness-evaluator [roda novamente com 6 sessões]

Resultado:
  Baseline chain: mean=0.81
  v001 chain: mean=0.89 ← VENCEDOR
  
✅ v001 aprovado → vira novo baseline
   skills/tdd-orchestrator/SKILL.md ← v001/SKILL.md
   
Próximas sessões já usam v001 (melhorado automaticamente)
```

---

## Benefício Principal

**Sem HarnessKit**: Cada desenvolvedor, cada projeto, usa skills diferentes e sem aprendizado cumulativo.
**Com HarnessKit**: Skills melhoram com dados de TODAS as sessões, em um ciclo de otimização contínua.

**Resultado**: Skills evoluem com dados históricos, não por guesswork.
