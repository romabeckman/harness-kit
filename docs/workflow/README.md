# 📖 HarnessKit: Documentação de Sequência de Uso

Este conjunto de documentos explica como você (desenvolvedor) usa todas as skills do HarnessKit em uma sequência lógica de otimização contínua.

---

## 📚 Documentos Criados

### 1. **[USUARIO-WORKFLOW.md](USUARIO-WORKFLOW.md)** — Guia Completo
**O que é:** Explicação detalhada de como um desenvolvedor segue a sequência lógica do harness-kit.

**Contém:**
- ✅ Fluxo 1: Desenvolvimento Normal (dia a dia)
  - Etapa 1: project-memory (contexto)
  - Etapa 2: scope-refinement (DDD + design)
  - Etapa 3: tdd-orchestrator (implementação)
  - Etapa 4: the-grumpy-tech-lead (review)
  - Etapa 5: harness-tracer (registro)
- ✅ Fluxo 2: Otimização de Harness (meta-harness loop)
- ✅ Exemplo prático: Registrar ADR e usar nas próximas sessões
- ✅ Matriz de decisão: qual skill usar quando
- ✅ Benefícios da sequência vs desenvolvimento ad-hoc

**Leia quando:** Você quer entender o fluxo completo.

---

### 2. **[ARQUITETURA-3-CAMADAS.md](ARQUITETURA-3-CAMADAS.md)** — Visão Arquitetural
**O que é:** Diagrama em 3 camadas mostrando como Developer, Skills e Filesystem interagem.

**Contém:**
- ✅ Camada 1: Desenvolvedor (você)
- ✅ Camada 2: Skills (módulos)
- ✅ Camada 3: Filesystem 𝒟 (armazenamento)
- ✅ Fluxo de retroalimentação (feedback loop visual)
- ✅ Exemplo prático: Ciclo completo de 8 dias
- ✅ Ganho: Com vs sem harness

**Leia quando:** Você quer visualizar a arquitetura inteira.

---

### 3. **[PLAYBOOK-USO-DIARIO.md](PLAYBOOK-USO-DIARIO.md)** — Checklist Prático
**O que é:** Passo-a-passo executável para cada tipo de tarefa.

**Contém:**
- ✅ Checklist de preparação
- ✅ Fluxo 1: Implementar feature nova (passo-a-passo com código)
- ✅ Fluxo 2: Corrigir bug (passo-a-passo)
- ✅ Fluxo 3: Otimizar harness (passo-a-passo)
- ✅ Matriz de decisão rápida
- ✅ Exemplo cronometrado (09:00 até 10:05)
- ✅ Troubleshooting

**Leia quando:** Você quer saber exatamente o que fazer agora.

---

### 4. **[DOCUMENTACAO-INDEX.md](DOCUMENTACAO-INDEX.md)**

### Se você está começando:
```
1. Leia USUARIO-WORKFLOW.md (30-40 min)
   → Entenda fluxo completo
   
2. Leia PLAYBOOK-USO-DIARIO.md (10-15 min)
   → Saiba como executar
   
3. Consulte ARQUITETURA-3-CAMADAS.md (5 min)
   → Quando tiver dúvida visual
```

### Se você está implementando:
```
1. Leia PLAYBOOK-USO-DIARIO.md
   → Siga passo-a-passo
   
2. Consulte USUARIO-WORKFLOW.md
   → Para entender por que faz cada coisa
```

### Se você quer ensinar outras pessoas:
```
1. ARQUITETURA-3-CAMADAS.md (diagrama)
2. USUARIO-WORKFLOW.md (fluxo lógico)
3. PLAYBOOK-USO-DIARIO.md (como fazer)
```

---

## 🔑 Conceitos-Chave

### HarnessKit: Otimização Contínua
**Princípio:** Otimizar "skills" (ferramentas que governam desenvolvimento) através de feedback de sessões.

**Componentes:**
- meta-harness (proposer: lê histórico e propõe melhorias)
- docs/harness-history/ (filesystem: histórico completo)
- harness-tracer (registra cada sessão)
- harness-evaluator (analisa padrões)
- pareto-frontier.md (melhores configurações)

---

## 📊 Fluxo em 1 Página

```
┌─────────────────────────────────────────────┐
│ DIA 1-5: Desenvolvimento Normal (5 sessões) │
├─────────────────────────────────────────────┤
│ Você: /harness-kit:project-memory          │
│       /harness-kit:scope-refinement        │
│       /harness-kit:tdd-orchestrator        │
│       /harness-kit:the-grumpy-tech-lead    │
│ [automático] harness-tracer                │
│       ↓ (cada sessão cria session-*/     │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ DIA 6: Análise de Padrões                   │
├─────────────────────────────────────────────┤
│ Você: /harness-kit:harness-evaluator       │
│       (analisa 5 traces)                   │
│       → pareto-frontier.md (melhores)      │
│       → identifica "weak skill"            │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ DIA 7: Otimização (Loop de Melhoria)        │
├─────────────────────────────────────────────┤
│ Você: /harness-kit:meta-harness            │
│       (lê 𝒟, diagnostica, propõe v001)   │
│                                            │
│ Você testa v001 em prática                │
│       (executa skill modificada)           │
│       /harness-kit:harness-tracer          │
│                                            │
│ Você valida:                               │
│       /harness-kit:harness-evaluator       │
│       (v001 melhorou? ✅ aprovado)        │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ DIA 8+: Usar Versão Melhorada               │
├─────────────────────────────────────────────┤
│ skills/tdd-orchestrator/SKILL.md           │
│   ← v001/SKILL.md (versão melhor)         │
│                                            │
│ Próximas sessões já usam versão melhorada  │
│ (feedback loop automático)                 │
└─────────────────────────────────────────────┘

RESULTADO: Harness melhorou, score subiu 0.08 pontos
```

---

## 🚀 Começar Agora

### Passo 1: Leia USUARIO-WORKFLOW.md
```
Tempo: 30-40 min
Meta: Entender fluxo completo
```

### Passo 2: Leia PLAYBOOK-USO-DIARIO.md
```
Tempo: 10-15 min
Meta: Saber como executar
```

### Passo 3: Execute sua primeira sessão
```
/harness-kit:project-memory
/harness-kit:tdd-orchestrator
/harness-kit:harness-tracer
```

### Passo 4: Depois de 5 sessões
```
/harness-kit:harness-evaluator
/harness-kit:meta-harness
```

---

## 📞 Dúvidas?

| Pergunta | Resposta em |
|----------|-------------|
| "Por onde começo?" | PLAYBOOK-USO-DIARIO.md |
| "O que é cada skill?" | USUARIO-WORKFLOW.md |
| "Qual skill usar agora?" | PLAYBOOK-USO-DIARIO.md (Matriz) |
| "Como funciona meta-harness?" | USUARIO-WORKFLOW.md (Fluxo 2) |
| "Quanto tempo leva?" | PLAYBOOK-USO-DIARIO.md (Cronômetro) |
| "Qual é a arquitetura?" | ARQUITETURA-3-CAMADAS.md |
| "Deu erro, como fixa?" | PLAYBOOK-USO-DIARIO.md (Troubleshooting) |

---

## ✅ Checklist: Tudo Pronto?

Seu HarnessKit está pronto para usar quando:

- [ ] Você tem `docs/README.md`, `docs/adr/ARCHITECTURE.md`, `docs/adr/TESTS.md`
- [ ] Você entendeu a diferença entre skills (tools) e chains (sequências)
- [ ] Você sabe qual skill usar para sua próxima tarefa
- [ ] Você entendeu como harness-tracer registra sessões
- [ ] Você sabe o que é Pareto frontier
- [ ] Você entendeu o ciclo: Develop → Trace → Evaluate → Optimize
- [ ] Você leu pelo menos um dos 4 documentos acima

---

## 🎓 Resumo em 2 Frases

1. **Fluxo**: Você executa skills (`project-memory` → `scope-refinement` → `tdd-orchestrator` → `the-grumpy-tech-lead`).
2. **Loop**: Cada sessão é registrada (`harness-tracer` → `docs/harness-history/`). Após 5 sessões, `meta-harness` detecta padrões e propõe melhorias (`harness-evaluator` → `meta-harness` → `candidates/vXXX/`).

**Resultado**: Skills evoluem com dados, não por guesswork.

---

**Data**: Maio 2026

