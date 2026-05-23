# HarnessKit: Guia de Sequência Lógica de Uso

> **Propósito**: Demonstrar como um desenvolvedor usa todas as skills em uma sequência lógica, com exemplo prático de ADR + ciclo de desenvolvimento.

---

## 📖 Fluxo de Otimização Contínua

O HarnessKit implementa um **loop de otimização de harness** onde:

```
Componente                    | HarnessKit
─────────────────────────────────────────────────────
Proposer (agent)              | meta-harness (skill)
Filesystem (history)          | docs/harness-history/
Scores por candidato          | docs/harness-history/traces/*/score.md
Traces de execução            | docs/harness-history/traces/*/steps.md
Diagnóstico causal            | meta-harness + verdict.md
Proposta de melhoria (código) | candidates/vXXX/SKILL.md
```

**Algoritmo de Otimização** (loop de harness):
```
1. Initialize population ℋ with baseline skills
2. FOR EACH skill in ℋ: Evaluate, store trace + score in filesystem 𝒟
3. FOR t = 1..N iterations:
   a. Proposer reads all 𝒟 (code, traces, scores)
   b. Proposer proposes new harness candidate
   c. Evaluate candidate (run it in practice)
   d. Store result in 𝒟
   e. Compute Pareto frontier
4. RETURN best harness
```

**Mapeamento:**
```
1. Initialize: project-memory + scope-refinement setup baseline skills
2. Multiple sessions: tdd-orchestrator + the-grumpy-tech-lead + harness-tracer
   → cada trace vai para 𝒟 (filesystem)
3. Optimization loop:
   a. harness-evaluator reads 𝒟 → Pareto frontier
   b. meta-harness reads 𝒟 → proposes candidate
   c. You test candidate (manual validation)
   d. harness-tracer registers new trace
   e. Repeat
```

---

## 🔄 FLUXO 1: Desenvolvimento Normal (Iteração Diária)

**Cenário**: Você tem uma feature para implementar.

### Etapa 1: Contexto (project-memory)

```bash
/harness-kit:project-memory
```

**O que faz:**
- ✅ Detecta stack (Node/Python/Go/etc)
- ✅ Lê ou cria: `docs/README.md` (navegação)
- ✅ Lê ou cria: `docs/adr/ARCHITECTURE.md` (patterns, layers, decisões)
- ✅ Lê ou cria: `docs/adr/TESTS.md` (frameworks, comandos, padrões)

**Onde fica:**
```
docs/
├── README.md              ← Índice do projeto
├── adr/
│   ├── ARCHITECTURE.md    ← Como código é organizado
│   ├── TESTS.md           ← Como testes rodam
│   └── (outras ADRs opcionais)
└── feature/
    └── (documentação de feature)
```

**Por quê:** O agente precisa entender sua arquitetura antes de implementar. Sem isso, propõe código desalinhado.

---

### Etapa 2: Design (scope-refinement)

```bash
/harness-kit:scope-refinement
```

**Você fornece:**
- Descrição do domínio (ex: "Sistema de carrinho de compras com cupons")
- Caminhos dos projetos afetados
- Nome da issue (ex: `cart-coupon-system`)

**Skill executa fases DDD:**
1. **Problem Space** → "Por que esta feature existe? Qual problema resolve?"
2. **Context Map** → "Quais bounded contexts interagem?"
3. **Tactical Design** → "Quais agregados, value objects, services?"
4. **Test Scenarios** → "Quais casos de teste devem passar?"

**Output:**
```
docs/specs/cart-coupon-system/
├── 001-problem-space.md      ← Problema, usuários, métricas de sucesso
├── 002-context-map.md        ← Interações entre contextos
├── 003-tactical-design.md    ← Estrutura de classes/tipos
└── 004-test-scenarios.md     ← Casos de teste em Gherkin/BDD
```

**Exemplo Problem Space para Cupons:**
```markdown
# Problem Space - Cupom de Desconto

## Business Drivers
- Aumentar conversão em checkout
- Reduzir abandono de carrinho
- Permitir campanhas sazonais

## Bounded Context
- `Coupon Context`: Regras de cupom, validação
- `Cart Context`: Aplicação de cupom ao total
- `Payment Context`: Validação antes do pagamento

## Success Metrics
- Reduzir abandono em 5%
- Suportar 1000 cupons simultâneos
- Tempo de validação < 50ms
```

**Por quê:** Define cenários de teste ANTES de código. Reduz retrabalho.

---

### Etapa 3: Implementação (tdd-orchestrator)

```bash
/harness-kit:tdd-orchestrator
```

**Skill coordena o ciclo TDD completo:**

#### RED (Teste Falha)
```javascript
// 1. Escrever teste que DEVE falhar
describe('Coupon Validation', () => {
  test('deve validar cupom com desconto percentual', () => {
    const coupon = { code: 'SUMMER20', discount: 20, type: 'percent' };
    const cart = { items: [{ price: 100 }], total: 100 };
    
    const result = applyCoupon(cart, coupon);
    
    expect(result.total).toBe(80);  // 100 - 20%
    expect(result.applied).toBe(true);
  });
});
```

```bash
npm test
# ❌ FAIL: applyCoupon is not defined
```

#### GREEN (Implementação Mínima)
```javascript
// 2. Escrever MÍNIMO para passar
function applyCoupon(cart, coupon) {
  if (coupon.type === 'percent') {
    const discount = cart.total * (coupon.discount / 100);
    return {
      total: cart.total - discount,
      applied: true
    };
  }
  return { ...cart, applied: false };
}
```

```bash
npm test
# ✅ PASS
```

#### REFACTOR (Melhoria)
```javascript
// 3. Limpar, remover duplicação, melhorar legibilidade
class CouponValidator {
  static apply(cart, coupon) {
    const discount = CouponValidator.calculate(cart, coupon);
    return { ...cart, total: cart.total - discount, applied: true };
  }

  private static calculate(cart, coupon) {
    if (coupon.type === 'percent') return cart.total * (coupon.discount / 100);
    if (coupon.type === 'fixed') return coupon.discount;
    return 0;
  }
}
```

```bash
npm test
# ✅ PASS (refactor não quebra)
```

**Ciclo completo registra:**
- Quantas iterações até GREEN
- Se precisou de debugging
- Se refactor foi bem sucedido

---

### Etapa 4: Revisão Arquitetural (the-grumpy-tech-lead)

```bash
/harness-kit:the-grumpy-tech-lead
```

**Skill questiona (Socraticamente):**

```
Tech Lead Analysis: Possível problema de performance em validação

Open Points:
- Você testou com 10.000 cupons simultâneos?
  Como a busca de cupom (lookup) se comporta em escala?
- A validação precisa chamar o banco de dados?
  Se SIM: há índice? Há cache?
  Se NÃO: dados são atualizados em tempo real? Como sincroniza?
- E se alguém aplicar dois cupons? Há proteção?
- Há timeout definido? O que acontece se a validação travar?
```

**Você resolve (via novo ciclo TDD):**
```javascript
// Novo teste para proteger contra múltiplos cupons
test('deve rejeitar segundo cupom', () => {
  const cart = { items: [], coupons: ['SUMMER20'] };
  const result = applyCoupon(cart, { code: 'WINTER50' });
  expect(result.applied).toBe(false);
  expect(result.reason).toBe('Only one coupon per order');
});
```

---

### Etapa 5: Registro de Sessão (harness-tracer)

```bash
# Automaticamente invocado no final de tdd-orchestrator
/harness-kit:harness-tracer
```

**Cria estrutura:**
```
docs/harness-history/traces/session-2026-05-22-001/
├── metadata.md      ← skill_used: tdd-orchestrator, agent: developer-backend
├── input.md         ← task: "Implementar validação de cupom"
├── steps.md         ← ações: RED → GREEN → REFACTOR
├── score.md         ← métricas: tdd_cycles: 3, iterations: 2, grumpy_points: 5
└── verdict.md       ← "Bem estruturado. Risco: validação sem cache."
```

**Seu `score.md` registra:**
```markdown
# Session Score

## Raw Metrics
- tdd_cycles: 3                    ← Quantas vezes RED→GREEN→REFACTOR?
- iterations_to_pass: 2           ← Quantas corridas até todos testes passarem?
- grumpy_open_points: 5           ← Quantos pontos levantados pelo tech-lead?
- context_docs_read: 3            ← docs/adr/ARCHITECTURE.md + TESTS.md + feature
- skill_chain_length: 5           ← Quantas skills foram invocadas?
- deviations: 0                   ← Passos pulados ou repetidos?
- blockers_hit: 0                 ← Quantas vezes parou por erro/falta de contexto?

## Computed Score
[vazio — será preenchido por harness-evaluator]
```

**Por quê:** Isso é o material bruto para otimização. Será lido depois para melhorar as skills.

---

## 🤖 FLUXO 2: Otimização de Harness

**Quando executar**: A cada 5–10 sessões de desenvolvimento.

### Passo 1: Analisar Histórico (harness-evaluator)

```bash
/harness-kit:harness-evaluator
```

**O que faz:**
1. Lê todos os traces em `docs/harness-history/traces/`
2. Agrupa por skill_chain (ex: tdd-orchestrator → the-grumpy-tech-lead)
3. Calcula scores compostos (combina todas as métricas)
4. Identifica **Pareto frontier** (configurações não-dominadas)

**Output:**
```
docs/harness-history/pareto-frontier.md

═══════════════════════════════════════════════════════════
Skill Chain Analysis
═══════════════════════════════════════════════════════════

1. tdd-orchestrator → project-memory → the-grumpy-tech-lead
   Sessions: 7
   Mean Score: 0.82 ⭐⭐⭐⭐
   Best: session-2026-05-20-002 (0.91)
   Issue: grumpy_open_points variável (σ=1.8)

2. tdd-orchestrator → scope-refinement → the-grumpy-tech-lead
   Sessions: 4
   Mean Score: 0.71 ⭐⭐⭐
   Best: session-2026-05-19-001 (0.84)
   Issue: project-memory skipped → context_docs_read baixo

3. scope-refinement only
   Sessions: 2
   Mean Score: 0.45 ⭐⭐
   Issue: Sem implementação real, métricas incompletas
```

**Hipóteses para melhoria:**
- Skill #1 funciona bem, mas `the-grumpy-tech-lead` é inconsistente
- Skill #2 funciona melhor quando `project-memory` é executado primeiro
- `scope-refinement` sozinho não gera dados suficientes

---

### Passo 2: Propor Candidato (meta-harness)

```bash
/harness-kit:meta-harness
```

**Skill executa Diagnosis Protocol:**

#### 1. Seleciona Sessões Piores
Grep nos scores mais baixos:
```
session-2026-05-18-001  score: 0.31 ❌ (pior)
session-2026-05-18-002  score: 0.42 ❌ (pior)
session-2026-05-17-003  score: 0.51 ✓ (médio)
```

#### 2. Lê Traces Completos
```
Pior sessão (2026-05-18-001):
  skill_chain: tdd-orchestrator → the-grumpy-tech-lead
  steps.md:
    1. ✅ Leu ARCHITECTURE.md (1 doc)
    2. ✅ Escreveu testes → 3 ciclos RED/GREEN
    3. ❌ the-grumpy-tech-lead levantou 8 pontos
       - "Sem cache de validação"
       - "N+1 em loop de carrinho"
       - "Sem timeout em API externa"
    4. ❌ Não resolveu nenhum ponto (parou por falta de tempo)
    5. ❌ Desvio: Tech-lead invocado no final, não no meio

Melhor sessão (2026-05-20-002):
  skill_chain: project-memory → tdd-orchestrator → the-grumpy-tech-lead
  steps.md:
    1. ✅ project-memory leu 4 docs (contexto amplo)
    2. ✅ tdd-orchestrator: 3 ciclos RED/GREEN
    3. ✅ the-grumpy-tech-lead invocado NO MEIO do ciclo 2
    4. ✅ Resolveu 6 de 7 open-points
    5. ✅ Sem desvios, fluxo linear
```

#### 3. Forma Hipótese Causal
```
CAUSA RAIZ:
Sessões fracassam quando the-grumpy-tech-lead é invocado apenas
no FINAL do desenvolvimento. Isso faz o desenvolvedor gastar tempo
em código que será rejeitado por problemas arquiteturais.

EVIDÊNCIA:
- Sessões com early-review (meio do ciclo) têm score 0.80+
- Sessões com late-review (fim) têm score 0.40-0.60
- grumpy_open_points não resolvidos correlacionam com score baixo

SOLUÇÃO:
Modificar tdd-orchestrator para invocar the-grumpy-tech-lead
APÓS O PRIMEIRO CICLO RED→GREEN (não esperar até final).
```

#### 4. Cria Candidato

```
docs/harness-history/candidates/v001/
├── rationale.md       ← explicação acima
└── SKILL.md          ← cópia de tdd-orchestrator COM modificação
```

**Mudança em `tdd-orchestrator` SKILL.md:**

**ANTES:**
```
### Step 3: Run Tests
### Step 4: Update Documentation
### Step 5: Final Validation (use skill `verification-before-completion`)
→ Invoke the-grumpy-tech-lead AFTER all tests pass
```

**DEPOIS (Candidato v001):**
```
### Step 3: Run Tests
### Step 3.5: Early Architecture Review (NEW!)
→ After FIRST successful test cycle, invoke the-grumpy-tech-lead
→ Resolve critical points BEFORE continuing implementation
### Step 4: Update Documentation
### Step 5: Final Validation
→ Invoke the-grumpy-tech-lead AGAIN (catch edge cases)
```

---

### Passo 3: Validar Candidato (você, manual)

```bash
# Execute uma tarefa usando tdd-orchestrator MODIFICADO (v001)
/harness-kit:tdd-orchestrator    ← usa candidates/v001/SKILL.md
```

**Você observa:**
- ✅ Tech-lead invocado mais cedo (ciclo 1)
- ✅ Problemas arquiteturais surfaced early
- ✅ Refactor é mais focado
- ⚠️ Tomou mais tempo no início (mais pontos abertos)

**Registra sessão:**
```bash
/harness-kit:harness-tracer
```

**score.md da nova sessão:**
```
- tdd_cycles: 4           ← +1 (mais ciclos, mas mais focados)
- iterations_to_pass: 2  ← manteve
- grumpy_open_points: 7  ← mais pontos, mas mais cedo
- context_docs_read: 4   ← aumentou (lê mais para resolver pontos)
- deviations: 0          ← sem desvios
```

---

### Passo 4: Iterar (Loop de Otimização)

```bash
/harness-kit:harness-evaluator    ← analisa novamente
```

**Resultado:**
```
Candidato v001 vs Baseline:
- Mean Score: 0.85 (vs 0.82 anterior) → ✅ MELHORIA 0.03 pontos
- Best Case: 0.94 (vs 0.91 anterior)
- Consistency: σ=0.8 (vs 1.8 anterior) → ✅ MUITO MAIS CONSISTENTE
```

**Decisão:**
```
✅ v001 APROVADO → Vira novo baseline
   skills/tdd-orchestrator/SKILL.md ← v001/SKILL.md
```

**Próximo ciclo de desenvolvimento já usa v001.**

Se tivesse regredido:
```
❌ v001 REJEITADO → Propor v002 com hipótese diferente
```

---

## 📝 Exemplo Prático Completo: Registrar ADR

**Cenário**: Você decidiu usar Redis cache para cupons (não sabe se documenta).

### 1. Qual skill usar?

```
Pergunta: "Preciso documentar a decisão de usar Redis para cache de cupons"
Resposta: project-memory (cria ADR de decisão arquitetural)
```

### 2. Invocar skill

```bash
/harness-kit:project-memory
Contexto: Cache de cupons com Redis
Tipo: Decisão arquitetural (ADR)
```

### 3. Arquivo gerado

```
docs/adr/REDIS-COUPON-CACHE.md

# Decisão Arquitetural: Redis para Cache de Cupom

## CONTEXTO
Validação de cupom era a operação mais lenta (500ms média).
Banco de dados era bottleneck: 40% de queries.

## ALTERNATIVAS CONSIDERADAS
1. **Cache em memória (Node)** - rápido, mas não compartilhado entre replicas
2. **Redis** - rápido, distribuído, TTL automático (ESCOLHIDO)
3. **Memcached** - mais simples, menos features
4. **Database query + índice** - lento para alta concorrência

## DECISÃO
Usar Redis com TTL de 1h para cache de cupons válidos.
Invalidar no evento de atualização de cupom.

## CONSEQUÊNCIAS
✅ Latência: 500ms → 50ms (10x mais rápido)
✅ CPU de banco: 40% → 5%
❌ Complexidade operacional (novo serviço)
❌ Risco: dados desincronizados por até 1h

## ALTERNATIVAS FUTURAS
- Pub/Sub entre replicas para invalidação instant
- TTL dinâmico baseado em frequência de acesso
```

### 4. Como é usado

Quando alguém implementa validação de cupom:

```bash
/harness-kit:tdd-orchestrator
  1. Lê docs/adr/ARCHITECTURE.md (vê referência a Redis)
  2. Lê docs/adr/REDIS-COUPON-CACHE.md (entende tradeoffs)
  3. Escreve testes que simulam cache expirado (edge case)
  4. Implementa com `cache-aside` pattern
  5. the-grumpy-tech-lead questiona:
     "E se Redis cair? Há fallback?"
     (Você implementa fallback: query direto ao DB)
```

**Assim, a decisão viaja através das sessões futuras.**

---

## 📊 Matriz de Decisão: Qual Skill Usar?

| Situação | Skill | Por quê |
|----------|-------|--------|
| Criar/atualizar docs de arquitetura | `project-memory` | Documentação é memória |
| Não sabe por onde começar | `scope-refinement` | Mapeia domínio com DDD |
| Implementar feature | `tdd-orchestrator` | Coordena RED→GREEN→REFACTOR |
| Código está pronto, quer revisar | `the-grumpy-tech-lead` | Questiona impacto sistêmico |
| Fim da sessão | `harness-tracer` | Registra para análise |
| Já tem 5+ sessões registradas | `harness-evaluator` | Analisa padrões |
| Quer melhorar as skills | `meta-harness` | Propõe melhoria baseada em dados |

---

## 🎯 Benefícios da Sequência

### Sem HarnessKit (Desenvolvimento Ad-hoc)
```
Session 1: Feature X → funcionou, mas sem documentação
Session 2: Developer diferente → reinventa roda
Session 3: Bug em X → procura 2h pelas decisões
Session 5: Tenta otimizar → não sabe onde começar
```

### Com HarnessKit (Desenvolvimento Estruturado)
```
Session 1: Feature X → documentado, testado, avaliado
           → Score registrado: 0.82

Session 2: Developer diferente → lê projeto-memory + traces
           → Entende contexto, Score: 0.85

Session 3: Bug em X → lê ADR de decisão
           → Fix é rapido, Score: 0.88

Session 5: Quer otimizar → meta-harness lê todas as 4 sessões
           → Identifica que "early tech-lead review" melhora score
           → Propõe v001 baseado em dados
           → Valida: Score passa para 0.91
```

**Resultado: Feedback loop de melhoria contínua sobre dados.**

---

## 🚀 Próximos Passos

1. **Comece simples**: Execute `project-memory` + `tdd-orchestrator` + `harness-tracer` por 5 sessões.
2. **Depois**: Rode `harness-evaluator` para ver padrões.
3. **Finalmente**: Use `meta-harness` para propor melhorias.

Cada execução deixa rastro. O sistema aprende com o rastro.
