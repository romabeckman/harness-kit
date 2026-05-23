# HarnessKit: Playbook de Uso Diário

Guia prático passo-a-passo para executar todas as skills no seu fluxo diário.

---

## 📋 Checklist: Antes de Começar um Projeto

- [ ] Projeto tem `docs/` folder? 
  - Se NÃO: `/harness-kit:project-memory` → cria estrutura
- [ ] `docs/README.md` existe e lista documentação?
  - Se NÃO: project-memory cria automaticamente
- [ ] `docs/adr/ARCHITECTURE.md` documentada?
  - Se NÃO: project-memory cria template, você preenche
- [ ] `docs/adr/TESTS.md` documentada?
  - Se NÃO: project-memory cria template com frameworks do seu stack
- [ ] `docs/harness-history/` inicializada?
  - Será criada automaticamente pela primeira execução de harness-tracer

---

## 🎯 Fluxo 1: Implementar Feature Nova

**Tempo total**: 30-90 min (depende de complexidade)

### Passo 1: Invocar project-memory (5 min)

```bash
/harness-kit:project-memory
```

**Você fornece:**
- Descrição: "Adicionar autenticação multi-fator"
- Qual documento atualizar: ARCHITECTURE.md (adiciona camada de auth)

**Resultado:**
- `docs/adr/ARCHITECTURE.md` atualizada com pattern de MFA
- Cross-references geradas
- **Saiba**: Qual é o stack? Quais patterns já existem?

---

### Passo 2: Invocar scope-refinement (10-15 min)

```bash
/harness-kit:scope-refinement
```

**Você fornece:**
- Scope: "Multi-factor authentication (MFA) com TOTP"
- Project paths: `/c/Users/romab/Codigo/seu-projeto`
- Domain name: `mfa-totp`
- Rules: "TOTP obrigatório apenas para admin"

**Skill executa:**
1. Problem Space (Por que MFA? Quais usuários? SLA?)
2. Context Map (Qual contexts tocam? Auth, User, Admin?)
3. Tactical Design (Aggregate: OTPCode, ValueObject: Secret?)
4. Test Scenarios (Happy path, wrong code, timeout)

**Resultado:**
```
docs/specs/mfa-totp/
├── 001-problem-space.md        ← Contexto de negócio
├── 002-context-map.md          ← Interações
├── 003-tactical-design.md      ← Estrutura
└── 004-test-scenarios.md       ← Gherkin/BDD
```

**Saiba**: Exatamente o que testar e por quê (antes de código).

---

### Passo 3: Invocar tdd-orchestrator (30-60 min)

```bash
/harness-kit:tdd-orchestrator
```

**Skill coordena RED → GREEN → REFACTOR:**

```bash
# Interno: skill invoca test-driven-development

## RED
npm test
# ❌ error TS2304: Cannot find name 'OTPValidator'

## Escrever teste (RED phase):
describe('OTPValidator', () => {
  test('deve validar código TOTP correto', () => {
    const validator = new OTPValidator(secret);
    const result = validator.validate(code);
    expect(result).toBe(true);
  });
  
  test('deve rejeitar código expirado', () => {
    // Time travel 31s forward
    const result = validator.validate(oldCode);
    expect(result).toBe(false);
  });
});

npm test
# ❌ FAIL: tests are failing (RED ✅)

## GREEN
class OTPValidator {
  validate(code) {
    const now = Date.now();
    const expectedCode = this.generateCode(now);
    return code === expectedCode && (now - this.lastValidation) > 30000;
  }
}

npm test
# ✅ PASS (GREEN ✅)

## REFACTOR
class OTPValidator {
  private readonly window: number = 30; // 30s
  private lastValidation: number = 0;
  
  validate(code: string): boolean {
    const isValid = this.isCodeValid(code);
    const isNotReused = this.isTimeWindowPassed();
    return isValid && isNotReused;
  }
  
  private isCodeValid(code: string): boolean {
    return code === this.generateCode();
  }
  
  private isTimeWindowPassed(): boolean {
    return (Date.now() - this.lastValidation) > this.window * 1000;
  }
}

npm test
# ✅ PASS (REFACTOR ✅)
```

**Skill invoca automaticamente:**
```
Após cada ciclo GREEN → verification-before-completion
         ↓
100% testes passando? ✅

Fim do ciclo RED→GREEN→REFACTOR → project-memory
         ↓
Atualizar docs/adr/TESTS.md com novos testes
```

**Resultado:**
- Código 100% testado
- Documento atualizado
- **Saiba**: Cada linha de código tem um teste

---

### Passo 4: Invocar the-grumpy-tech-lead (10-15 min)

```bash
/harness-kit:the-grumpy-tech-lead
```

**Skill questiona:**

```
Tech Lead Analysis: Autenticação com dependência temporal

Open Points (Socratic Method):
1. Você testou com timezone diferente?
   O TOTP funciona se server e client têm clock skew?
   Deve-se aceitar ±30s de tolerância?

2. E se o TOTP vai expirar em 2s e leva 10s para validar?
   Que tal aceitar código do período passado também?

3. Recovery codes: E se usuário perder acesso ao authenticator?
   Tem backup codes? Como armazena seguro?

4. Rate limiting: Quantas tentativas permite antes de bloquear?
   30 segundos = 2 tentativas apenas? Muito restritivo?
   Ou adicionar delay exponencial?

5. Logging: Qual informação de tentativas falhas é registrada?
   Log sensível não deve ir a stderr (security risk).
```

**Você resolve (via novo ciclo TDD):**

```javascript
// Novo teste: aceitar código anterior (período passado)
test('deve aceitar código do período anterior', () => {
  const code1 = validator.generateCode(); // período atual
  const code0 = validator.generateCode(-30); // período anterior
  
  // Depois de 30s passou, código1 está expirado
  setTimeout(() => {
    expect(validator.validate(code1)).toBe(false);
    expect(validator.validate(code0)).toBe(true); // ← tolerância
  }, 31000);
});

// Implementação com tolerância
validate(code: string): boolean {
  const now = Date.now();
  const current = this.generateCode(now);
  const previous = this.generateCode(now - 30000);
  
  return (code === current || code === previous) && 
         this.hasTimeWindowPassed();
}

// Novo teste: rate limiting
test('deve bloquear após 5 tentativas em 60s', () => {
  for (let i = 0; i < 5; i++) {
    expect(validator.validate('000000')).toBe(false); // cada falha
  }
  
  expect(() => validator.validate('123456'))
    .toThrow('Too many attempts');
});
```

**Resultado:**
- Código mais robusto
- Casos extremos cobertos
- **Saiba**: Quais são os riscos sistêmicos?

---

### Passo 5: Fim da Sessão (automático)

```bash
[tdd-orchestrator termina]
↓
[automático] /harness-kit:harness-tracer
```

**Tracer cria:**
```
docs/harness-history/traces/session-2026-05-22-001/
├── metadata.md
│   skill_used: tdd-orchestrator
│   agent: developer-backend
│   task_summary: Implementar autenticação TOTP
│   duration: long (> 60 min)
│
├── steps.md
│   # Skill Chain
│   project-memory → scope-refinement → tdd-orchestrator → the-grumpy-tech-lead
│
│   # Action Sequence
│   | 1 | Leu docs/adr/ARCHITECTURE.md | Read | success |
│   | 2 | Leu docs/specs/mfa-totp/ | Read | success |
│   | 3 | Escreveu teste 1 (happy path) | Write | success |
│   | 4 | tdd-orchestrator invocou test-driven... | Chain | RED ✅ |
│   | 5 | Implementei OTPValidator | Edit | success |
│   | 6 | Ciclo 1 passou | Bash | GREEN ✅ |
│   | 7 | Refatorei para classes | Edit | success |
│   | 8 | Ciclo 1 ainda passa | Bash | REFACTOR ✅ |
│   | 9 | Escreveu teste 2 (período anterior) | Write | success |
│   | 10| Ciclo 2: RED | Bash | RED ✅ |
│   | 11| Implementei tolerância | Edit | success |
│   | 12| Ciclo 2: GREEN | Bash | GREEN ✅ |
│   | ... | (mais testes/ciclos) | ... | ... |
│   | 25| the-grumpy-tech-lead levantou pontos | Eval | 5 pontos |
│   | 26| Implementei rate-limiting | Edit | success |
│   | 27| Todos ciclos ainda passam | Bash | SUCCESS ✅ |
│
├── score.md
│   tdd_cycles: 3              ← 3 vezes RED→GREEN→REFACTOR completo
│   iterations_to_pass: 2      ← 2 corridas de testes até 100%
│   grumpy_open_points: 5      ← 5 pontos levantados
│   context_docs_read: 4       ← docs lidos
│   skill_chain_length: 4      ← 4 skills invocadas
│   deviations: 0              ← sem desvios
│   blockers_hit: 0            ← sem bloqueadores
│
└── verdict.md
    # Session Verdict
    
    ## What Worked Well
    - Scope-refinement muito útil para entender casos de teste
    - TDD natural para código temporal (já entendia requisitos antes)
    - Tech-lead questions revelaram rate-limiting ausente
    
    ## What Caused Friction
    - TOTP specification complexa (timezone, tolerance window)
    - Recovery codes adicionaram ciclos extras
    - Debugging de Date() em testes foi lento
    
    ## Hypothesis
    "Talvez tech-lead review no MEIO da implementação (após ciclo 1)
     teria economizado tempo (não teria implementado rate-limiting wrong)"
    
    ## Recommended Change
    "Invocar the-grumpy-tech-lead após primeiro RED→GREEN,
     não no final de tudo"
```

**Tracer também registra em pareto-frontier.md:**
```
Current baseline chain:
  project-memory → tdd-orchestrator → the-grumpy-tech-lead
  mean_score: 0.80 (anterior, com N=3 sessões)

Novo score:
  score_composit = (3 + 2 + 5 + 4) / (1 + 5) = 0.83 ✅ melhorou
  n = 4 sessões
  new_mean = 0.81
```

---

## 🚦 Fluxo 2: Corrigir Bug Pequeno

**Tempo total**: 10-20 min

### Passo 1: Pular project-memory (já tem docs)

- Docs já existem
- Você sabe a arquitetura

### Passo 2: Invocar tdd-orchestrator apenas

```bash
/harness-kit:tdd-orchestrator
```

**RED:**
```bash
# Bug: OTPValidator não rejeita código repetido em 30s

describe('OTP Reuse', () => {
  test('deve rejeitar mesmo código dentro de 30s', () => {
    const code = validator.validate('123456'); // primeira vez
    expect(code).toBe(true);
    
    const reused = validator.validate('123456'); // mesmo código agora
    expect(reused).toBe(false); // ← BUG: retorna true (aceita reuso)
  });
});

npm test
# ❌ FAIL
```

**GREEN:**
```bash
# Adicionar tracking de código usado

validate(code: string): boolean {
  if (code === this.lastUsedCode) {
    return false; // rejeita reuso
  }
  
  const isValid = this.isCodeValid(code);
  if (isValid) {
    this.lastUsedCode = code; // registra uso
  }
  return isValid;
}

npm test
# ✅ PASS
```

**REFACTOR:**
```bash
# Melhorar nome de variável

private usedCodeCache: Set<string> = new Set();

validate(code: string): boolean {
  if (this.usedCodeCache.has(code)) {
    return false;
  }
  
  if (this.isCodeValid(code)) {
    this.usedCodeCache.add(code);
    return true;
  }
  return false;
}

npm test
# ✅ PASS
```

### Passo 3: Invocar the-grumpy-tech-lead (opcional, se complexo)

```
[Questiona cache de códigos usado]
- Quanto tempo guarda em cache? Sempre?
- Não vai crescer indefinidamente?
- Deveria expirar após 30s?
```

Você implementa limpeza:
```javascript
private usedCodeCache: Map<string, number> = new Map();

private cleanupExpiredCodes(): void {
  const now = Date.now();
  for (const [code, timestamp] of this.usedCodeCache.entries()) {
    if (now - timestamp > 30000) {
      this.usedCodeCache.delete(code);
    }
  }
}

validate(code: string): boolean {
  this.cleanupExpiredCodes(); // chama sempre
  
  if (this.usedCodeCache.has(code)) {
    return false;
  }
  
  if (this.isCodeValid(code)) {
    this.usedCodeCache.set(code, Date.now());
    return true;
  }
  return false;
}
```

### Passo 4: harness-tracer (automático)

```
score.md:
  tdd_cycles: 1               ← apenas 1 ciclo (bug simples)
  iterations_to_pass: 1       ← passou na primeira
  grumpy_open_points: 1 ou 2  ← se invocou
  context_docs_read: 1        ← leu ARCHITECTURE.md
```

---

## 📊 Fluxo 3: Otimizar Harness (a cada 5-10 sessões)

### Passo 1: Invocar harness-evaluator

```bash
/harness-kit:harness-evaluator
```

**Lê todos os 5+ traces:**
```
session-2026-05-22-001  score: 0.83 (feature MFA)
session-2026-05-22-002  score: 0.79 (bug OTP reuse)
session-2026-05-23-001  score: 0.74 (feature recovery codes)
session-2026-05-23-002  score: 0.88 (feature rate-limit) ⭐
session-2026-05-24-001  score: 0.81 (refactor testes)
```

**Gera pareto-frontier.md:**
```
Primary chain: project-memory → tdd-orchestrator → the-grumpy-tech-lead
  mean_score: 0.81
  best: 0.88 (session-2026-05-23-002)
  worst: 0.74 (session-2026-05-23-001)
  std_dev: 0.06
  
  Hypothesis for next iteration:
  - Sessão 0.88 invocou tech-lead no meio (após ciclo 1)
  - Sessão 0.74 invocou tech-lead só no final
  → Early review pode melhorar consistência
```

### Passo 2: Invocar meta-harness

```bash
/harness-kit:meta-harness
```

**Meta-harness diagnostica:**

1. Lê `pareto-frontier.md` → hipótese = "early tech-lead review"
2. Lê `session-2026-05-23-002` (0.88) → steps.md mostra:
   ```
   Step 10: tdd-orchestrator ciclo 1 GREEN
   Step 11: [INUSITADO] the-grumpy-tech-lead invocado aqui
            Levanta 3 pontos sobre cache
   Step 12: Volta para tdd ciclo 2 com contexto
   ```
3. Compara com `session-2026-05-23-001` (0.74) → steps.md mostra:
   ```
   [... muitos ciclos ...]
   Step 25: [FIM] the-grumpy-tech-lead invocado
            Levanta 7 pontos, mas muito tarde
   Step 26-30: Volta para implementar, novo ciclos
   ```

**Meta-harness propõe:**

```
docs/harness-history/candidates/v001/

rationale.md:
═══════════════════════════════════════════════════════════
Target Skill: tdd-orchestrator

Diagnosis:
Worst session (0.74) invoked the-grumpy-tech-lead only at END.
Best session (0.88) invoked it AFTER first RED→GREEN cycle.

Result: Early review found issues early,
        reducing rework cycles from 5 to 2.

Proposed Change:
Modify tdd-orchestrator to call the-grumpy-tech-lead
after FIRST complete RED→GREEN, not at the end.

Expected Impact:
- Lower iterations_to_pass (less rework)
- Higher score (better use of time)
- More consistent scores (σ down from 0.06 to 0.03)

Risk:
Might find too many issues early, overwhelming developer.
Mitigation: Tech-lead focuses on critical issues only.
═══════════════════════════════════════════════════════════

SKILL.md:
[Cópia de tdd-orchestrator modificada]

### Step 3.5: Early Architecture Review (NEW)
After the FIRST complete RED→GREEN cycle:
1. Invoke the-grumpy-tech-lead skill
2. Developer addresses CRITICAL open-points only
3. Return to Step 2 for next cycle

### Step 4: Run Tests (Final)
After all cycles complete, run tests one more time
to ensure no regressions from architectural fixes.

[... resto da skill ...]
```

### Passo 3: Você Testa v001

```bash
# Use v001/SKILL.md em seu próximo desenvolvimento
/harness-kit:tdd-orchestrator    ← Usa candidates/v001/SKILL.md
```

Executa com a feature nova (ex: backup codes):

```
Ciclo 1: RED → GREEN
  ✅ Teste básico passa

[NEW] Step 3.5: the-grumpy-tech-lead
  Levanta: "E se backup codes são vazados?"
           "Como regenerar?"
           "Quantas permissão?"
  
  Você resolve (1 ciclo extra):
  ✅ Testes para validade de backup codes
  ✅ Rate limiting na regeneração

Ciclo 2: RED → GREEN
  ✅ Teste de regeneração passa

[NEW] Step 3.5: the-grumpy-tech-lead
  Levanta: "E se alguém roubar backup codes?"
           "Auditoria de acesso?"
  
  Você implementa (1 ciclo extra):
  ✅ Teste de audit log
  ✅ Restrição de IP

Ciclo 3: RED → GREEN
  ✅ Todos testes passam

[automático] harness-tracer
```

**Score de teste v001:**
```
score.md:
  tdd_cycles: 3               (mesmo que antes)
  iterations_to_pass: 1       ← MELHOROU (era 2)
  grumpy_open_points: 6       (encontrou cedo)
  context_docs_read: 4
  deviations: 0
  
  composite_score = 0.89 ← MELHOROU de 0.81
```

### Passo 4: Validar e Aprovar

```bash
/harness-kit:harness-evaluator    ← Roda novamente
```

**Resultado:**
```
Baseline: mean_score = 0.81 (com 5 sessões)
v001:     mean_score = 0.89 (teste adicional)

✅ APROVADO → v001 vira novo baseline
   skills/tdd-orchestrator/SKILL.md ← v001/SKILL.md

Próximas sessões usam v001 automaticamente (melhorado!)
```

---

## 📋 Matriz de Decisão Rápida

| Cenário | Comando | Tempo |
|---------|---------|-------|
| Novo projeto | `/harness-kit:project-memory` | 5 min |
| Nova feature grande | `project-memory → scope-refinement → tdd-orchestrator → the-grumpy-tech-lead` | 60-90 min |
| Nova feature pequena | `tdd-orchestrator` | 15-30 min |
| Bug simples | `tdd-orchestrator` | 10-20 min |
| Bug complexo | `tdd-orchestrator → the-grumpy-tech-lead` | 20-40 min |
| ADR novo | `project-memory` | 10-15 min |
| Análise (5+ sessões) | `harness-evaluator` | 10 min |
| Otimizar harness | `harness-evaluator → meta-harness → (teste) → harness-evaluator` | 30-60 min |

---

## 🎓 Exemplo Real: Cronômetro Simulado

```
09:00 - Começar sessão (Feature: Validar MFA)
        /harness-kit:project-memory           [5 min] ✅
        /harness-kit:scope-refinement         [15 min] ✅
        /harness-kit:tdd-orchestrator RED     [10 min] ✅
09:30 - Primeiro ciclo RED→GREEN
        npm test ✅
        /harness-kit:the-grumpy-tech-lead     [10 min] ✅ [5 open-points]
09:40 - Volta para implementação (Ciclo 2)
        /harness-kit:tdd-orchestrator GREEN   [10 min] ✅
        npm test ✅
        /harness-kit:the-grumpy-tech-lead     [5 min] ✅ [2 novos pontos]
09:55 - Ciclo 3 (REFACTOR)
        /harness-kit:tdd-orchestrator REFACTOR [10 min] ✅
        npm test ✅ [todos ainda passam]
10:05 - Fim
        [automático] /harness-kit:harness-tracer ✅
        
Session criado: session-2026-05-22-003
Score: tdd_cycles=3, iterations=2, grumpy_points=7
       composite_score: 0.85 ✅

════════════════════════════════════════════════════════════
ACUMULADO (após 6 sessões):
  baseline mean_score: 0.81
  melhor sessão: 0.88
  pior: 0.74
  
  /harness-kit:harness-evaluator
  → Hipótese: early tech-lead review melhora score
  
  /harness-kit:meta-harness
  → Propõe: v001 (tdd-orchestrator + early review)
  
  [Você testa v001]
  → v001 score: 0.89 ✅
  
  /harness-kit:harness-evaluator
  → ✅ APROVADO
  
  skills/tdd-orchestrator/SKILL.md ← v001/SKILL.md
  
RESULTADO: Harness melhorou automaticamente (+0.08 pontos)
════════════════════════════════════════════════════════════
```

---

## ✅ Checklist de Qualidade

Ao fim de cada sessão:

- [ ] Todos testes passam? (`npm test`)
- [ ] Documentação atualizada? (docs/adr/)
- [ ] The-grumpy-tech-lead foi invocado?
- [ ] Open-points foram resolvidos?
- [ ] harness-tracer foi executado? (salvo session-*/)
- [ ] Score foi registrado em score.md?

---

## 🚨 Troubleshooting

| Problema | Solução |
|----------|---------|
| harness-tracer não criou sesión | Você invocou tdd-orchestrator? Ele invoca tracer automaticamente |
| pareto-frontier vazio | Precisa de ≥3 sessões. Rode tdd-orchestrator 3x primeiro |
| meta-harness não propõe candidato | pareto-frontier não tem hipóteses? Leia verdict.md de piores sessões |
| v001 rejeitado (score pior) | Hipótese errada. meta-harness propõe v002. Estude novo trace |
| Tomando muito tempo com the-grumpy-tech-lead | Limitar a 5-7 open-points. Priorize sistêmicos vs. estilo |

