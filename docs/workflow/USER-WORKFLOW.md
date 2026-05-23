# HarnessKit: User Workflow Guide

> **Purpose**: Demonstrate how a developer uses all skills in a logical sequence, with practical ADR example + development cycle.

---

## 📖 Continuous Optimization Loop

HarnessKit implements a **harness optimization loop** where:

```
Component                    | HarnessKit
─────────────────────────────────────────────────────
Proposer (agent)              | meta-harness (skill)
Filesystem (history)          | docs/harness-history/
Scores per candidate          | docs/harness-history/traces/*/score.md
Execution traces              | docs/harness-history/traces/*/steps.md
Causal diagnosis              | meta-harness + verdict.md
Improvement proposal (code)   | candidates/vXXX/SKILL.md
```

**Optimization Algorithm** (harness loop):
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

**Mapping:**
```
1. Initialize: project-memory + scope-refinement setup baseline skills
2. Multiple sessions: tdd-orchestrator + the-grumpy-tech-lead + harness-tracer
   → each trace goes to 𝒟 (filesystem)
3. Optimization loop:
   a. harness-evaluator reads 𝒟 → Pareto frontier
   b. meta-harness reads 𝒟 → proposes candidate
   c. You test candidate (manual validation)
   d. harness-tracer registers new trace
   e. Repeat
```

---

## 🔄 FLOW 1: Normal Development (Daily Iteration)

**Scenario**: You have a feature to implement.

### Stage 1: Context (project-memory)

```bash
/harness-kit:project-memory
```

**What it does:**
- ✅ Detects stack (Node/Python/Go/etc)
- ✅ Reads or creates: `docs/README.md` (navigation)
- ✅ Reads or creates: `docs/adr/ARCHITECTURE.md` (patterns, layers, decisions)
- ✅ Reads or creates: `docs/adr/TESTS.md` (frameworks, commands, patterns)

**Where it's stored:**
```
docs/
├── README.md              ← Project index
├── adr/
│   ├── ARCHITECTURE.md    ← How code is organized
│   ├── TESTS.md           ← How tests run
│   └── (other optional ADRs)
└── feature/
    └── (feature documentation)
```

**Why**: The agent needs to understand your architecture before implementing. Without it, it proposes misaligned code.

---

### Stage 2: Design (scope-refinement)

```bash
/harness-kit:scope-refinement
```

**You provide:**
- Domain description (ex: "Shopping cart system with coupons")
- Project paths affected
- Issue name (ex: `cart-coupon-system`)

**Skill executes DDD phases:**
1. **Problem Space** → "Why does this feature exist? What problem does it solve?"
2. **Context Map** → "Which bounded contexts interact?"
3. **Tactical Design** → "Which aggregates, value objects, services?"
4. **Test Scenarios** → "Which test cases should pass?"

**Output:**
```
docs/specs/cart-coupon-system/
├── 001-problem-space.md      ← Problem, users, success metrics
├── 002-context-map.md        ← Context interactions
├── 003-tactical-design.md    ← Class/type structure
└── 004-test-scenarios.md     ← Gherkin/BDD test cases
```

**Example Problem Space for Coupons:**
```markdown
# Problem Space - Discount Coupon

## Business Drivers
- Increase checkout conversion
- Reduce cart abandonment
- Enable seasonal campaigns

## Bounded Context
- `Coupon Context`: Coupon rules, validation
- `Cart Context`: Coupon application to total
- `Payment Context`: Validation before payment

## Success Metrics
- Reduce abandonment by 5%
- Support 1000 simultaneous coupons
- Validation time < 50ms
```

**Why**: Defines test scenarios BEFORE code. Reduces rework.

---

### Stage 3: Implementation (tdd-orchestrator)

```bash
/harness-kit:tdd-orchestrator
```

**Skill coordinates full TDD cycle:**

#### RED (Test Fails)
```javascript
// 1. Write test that MUST fail
describe('Coupon Validation', () => {
  test('should validate coupon with percentage discount', () => {
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

#### GREEN (Minimal Implementation)
```javascript
// 2. Write MINIMUM to pass
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

#### REFACTOR (Improvement)
```javascript
// 3. Clean, remove duplication, improve readability
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
# ✅ PASS (refactor doesn't break)
```

**Complete cycle records:**
- How many iterations until GREEN
- If debugging was needed
- If refactor was successful

---

### Stage 4: Architectural Review (the-grumpy-tech-lead)

```bash
/harness-kit:the-grumpy-tech-lead
```

**Skill questions (Socratically):**

```
Tech Lead Analysis: Possible performance issue in validation

Open Points:
- Did you test with 10,000 simultaneous coupons?
  How does coupon lookup (lookup) behave at scale?
- Does validation need to call the database?
  If YES: is there an index? Is there caching?
  If NO: is data updated in real time? How does it sync?
- What if someone applies two coupons? Any protection?
- Is timeout defined? What happens if validation hangs?
```

**You resolve (via new TDD cycle):**
```javascript
// New test to protect against multiple coupons
test('should reject second coupon', () => {
  const cart = { items: [], coupons: ['SUMMER20'] };
  const result = applyCoupon(cart, { code: 'WINTER50' });
  expect(result.applied).toBe(false);
  expect(result.reason).toBe('Only one coupon per order');
});
```

---

### Stage 5: Session Recording (harness-tracer)

```bash
# Automatically invoked at end of tdd-orchestrator
/harness-kit:harness-tracer
```

**Creates structure:**
```
docs/harness-history/traces/session-2026-05-22-001/
├── metadata.md      ← skill_used: tdd-orchestrator, agent: developer-backend
├── input.md         ← task: "Implement coupon validation"
├── steps.md         ← actions: RED → GREEN → REFACTOR
├── score.md         ← metrics: tdd_cycles: 3, iterations: 2, grumpy_points: 5
└── verdict.md       ← "Well structured. Risk: validation without cache."
```

**Your `score.md` records:**
```markdown
# Session Score

## Raw Metrics
- tdd_cycles: 3                    ← How many times RED→GREEN→REFACTOR?
- iterations_to_pass: 2           ← How many runs until all tests pass?
- grumpy_open_points: 5           ← How many points raised by tech-lead?
- context_docs_read: 3            ← docs/adr/ARCHITECTURE.md + TESTS.md + feature
- skill_chain_length: 5           ← How many skills invoked?
- deviations: 0                   ← Steps skipped or repeated?
- blockers_hit: 0                 ← How many times blocked by error/missing context?

## Computed Score
[empty — will be filled by harness-evaluator]
```

**Why**: This is raw material for optimization. Will be read later to improve skills.

---

## 🤖 FLOW 2: Harness Optimization

**When to run**: Every 5–10 development sessions.

### Step 1: Analyze History (harness-evaluator)

```bash
/harness-kit:harness-evaluator
```

**What it does:**
1. Reads all traces in `docs/harness-history/traces/`
2. Groups by skill_chain (ex: tdd-orchestrator → the-grumpy-tech-lead)
3. Computes composite scores (combines all metrics)
4. Identifies **Pareto frontier** (non-dominated configurations)

**Output:**
```
docs/harness-history/pareto-frontier.md

# Pareto Frontier — Best Skill Chains

## Top Configuration
- Chain: project-memory → tdd-orchestrator → the-grumpy-tech-lead
- Sessions analyzed: 5
- Mean score: 0.81
- Best score: 0.85
- Worst score: 0.78
- Consistency: σ=0.08

## Alternative Configuration
- Chain: scope-refinement → tdd-orchestrator → the-grumpy-tech-lead
- Sessions analyzed: 3
- Mean score: 0.76
- Best score: 0.84
- Worst score: 0.68
- Consistency: σ=0.12
```

**Skill also identifies patterns:**
```
Weak Points Detected:
1. Sessions with early tech-lead review score better (0.85 vs 0.78)
2. Sessions without recovery codes completed faster
3. Timezone-related bugs appeared in 2 sessions
```

### Step 2: Propose Improvement (meta-harness)

```bash
/harness-kit:meta-harness
```

**What it does:**
1. Reads filesystem (complete history)
2. Diagnoses: "Which skill is causing failures?"
3. Proposes: ONE focused change to that skill
4. Creates: `candidates/vXXX/` with rationale + modified SKILL.md

**Output:**
```
docs/harness-history/candidates/v001/

├── rationale.md
│   # Hypothesis for v001
│   
│   Observation: Sessions with grumpy_points=3 (early review)
│   scored 0.85, while grumpy_points=7 (late review) scored 0.78.
│   
│   Root cause: Late review discovered issues that required
│   reworking earlier cycles.
│   
│   Proposal: Invoke the-grumpy-tech-lead AFTER first RED→GREEN
│   cycle, not at the end. This allows resolving architectural
│   issues early.
│   
│   Expected impact: Reduce rework cycles by 1-2, improve score to 0.88+
│   Risk: Team might feel pressured to review too early
│
└── SKILL.md
   [modified tdd-orchestrator SKILL.md with early tech-lead invocation]
```

### Step 3: Test the Candidate (you run it)

```bash
/harness-kit:tdd-orchestrator
# [Uses v001/SKILL.md from candidates/ if you set it]
```

**Result:**
```
docs/harness-history/traces/session-2026-05-22-006/
├── metadata.md
│   candidate_tested: v001
│   ...
└── score.md
   tdd_cycles: 3
   iterations_to_pass: 1  ← Improved! (was 2)
   grumpy_open_points: 4   ← Fewer! (was 5)
   mean_score: 0.89        ← Better! (was 0.82)
```

### Step 4: Validate (harness-evaluator again)

```bash
/harness-kit:harness-evaluator
# [Runs again, includes v001 trace]
```

**Result:**
```
Candidate v001 vs Baseline:

Baseline chain: mean=0.81
v001 chain: mean=0.89

Decision: ✅ APPROVED

Next steps:
1. Copy v001/SKILL.md → skills/tdd-orchestrator/SKILL.md.baseline
2. Backup current → skills/tdd-orchestrator/SKILL.md.v000
3. Promote v001 → skills/tdd-orchestrator/SKILL.md

(or ❌ REJECTED if score decreased)
```

---

## 📊 One-Page Flow

```
┌─────────────────────────────────────────────┐
│ DAY 1-5: Normal Development (5 sessions)    │
├─────────────────────────────────────────────┤
│ You: /harness-kit:project-memory            │
│       /harness-kit:scope-refinement         │
│       /harness-kit:tdd-orchestrator         │
│       /harness-kit:the-grumpy-tech-lead     │
│ [automatic] harness-tracer                  │
│       ↓ (each session creates session-*/  │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ DAY 6: Pattern Analysis                     │
├─────────────────────────────────────────────┤
│ You: /harness-kit:harness-evaluator         │
│       (analyzes 5 traces)                   │
│       → pareto-frontier.md (best)           │
│       → identifies "weak skill"             │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ DAY 7: Optimization (Improvement Loop)      │
├─────────────────────────────────────────────┤
│ You: /harness-kit:meta-harness              │
│       (reads 𝒟, diagnoses, proposes v001) │
│                                             │
│ You test v001 in practice                  │
│       (run modified skill)                  │
│       /harness-kit:harness-tracer           │
│                                             │
│ You validate:                               │
│       /harness-kit:harness-evaluator        │
│       (v001 improved? ✅ approved)          │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ DAY 8+: Use Improved Version                │
├─────────────────────────────────────────────┤
│ skills/tdd-orchestrator/SKILL.md            │
│   ← v001/SKILL.md (better version)          │
│                                             │
│ Next sessions already use improved version  │
│ (automatic feedback loop)                   │
└─────────────────────────────────────────────┘

RESULT: Harness improved, score increased 0.08 points
```

---

## 🚀 Get Started Now

### Step 1: Read USER-WORKFLOW.md
```
Time: 30-40 min
Goal: Understand complete flow
```

### Step 2: Read PLAYBOOK-DAILY-USE.md
```
Time: 10-15 min
Goal: Know how to execute
```

### Step 3: Run your first session
```
/harness-kit:project-memory
/harness-kit:tdd-orchestrator
/harness-kit:harness-tracer
```

### Step 4: After 5 sessions
```
/harness-kit:harness-evaluator
/harness-kit:meta-harness
```

---

## 📞 Questions?

| Question | Answer in |
|----------|-----------|
| "Where do I start?" | PLAYBOOK-DAILY-USE.md |
| "What does each skill do?" | USER-WORKFLOW.md |
| "Which skill to use now?" | PLAYBOOK-DAILY-USE.md (Matrix) |
| "How does meta-harness work?" | USER-WORKFLOW.md (Flow 2) |
| "How long does it take?" | PLAYBOOK-DAILY-USE.md (Timeline) |
| "What's the architecture?" | ARCHITECTURE-3-LAYERS.md |
| "Got an error, how to fix?" | PLAYBOOK-DAILY-USE.md (Troubleshooting) |

---

## ✅ Checklist: Ready to Go?

Your HarnessKit is ready when:

- [ ] You have `docs/README.md`, `docs/adr/ARCHITECTURE.md`, `docs/adr/TESTS.md`
- [ ] You understand the difference between skills (tools) and chains (sequences)
- [ ] You know which skill to use for your next task
- [ ] You understand how harness-tracer records sessions
- [ ] You know what Pareto frontier is
- [ ] You understand the cycle: Develop → Trace → Evaluate → Optimize
- [ ] You've read at least one of the documents above

---

## 🎓 Summary in 2 Sentences

1. **Flow**: You run skills (`project-memory` → `scope-refinement` → `tdd-orchestrator` → `the-grumpy-tech-lead`).
2. **Loop**: Each session is recorded (`harness-tracer` → `docs/harness-history/`). After 5 sessions, `meta-harness` detects patterns and proposes improvements (`harness-evaluator` → `meta-harness` → `candidates/vXXX/`).

**Result**: Skills evolve with data, not guesswork.

---

**Date**: May 2026
