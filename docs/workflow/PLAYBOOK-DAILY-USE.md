# HarnessKit: Daily Use Playbook

Practical step-by-step guide to run all skills in your daily workflow.

> ### ⚡ Sovereign Loop: `autonomous-orchestrator`
> HarnessKit supports fully automated, sovereign execution via the **`autonomous-orchestrator`** skill. Once it boots and acquires the initial project scope, **it executes the entire development cycle atomically without pausing, prompting, or waiting for user confirmation**.
>
> ⚠️ **Why the Checklist is Absolutely Critical:**
> Because the orchestrator runs completely hands-off, **any gaps, missing files, or poorly defined architectural boundaries will cause the agent to work on wrong assumptions**. You must complete the **Checklist: Before Starting a Project** below with absolute diligence. A poorly prepared harness leads to incorrect domain models, mismatched test suites, and expensive rework loop retries. Ensuring your persistent memory (`docs/`) is robust before launching the loop is your primary safety mechanism.

---

## 📋 Checklist: Before Starting a Project

- [ ] Does the project have a `docs/` folder? 
  - If NO: `/harness-kit:project-memory` → creates structure
- [ ] Does `docs/README.md` exist and list documentation?
  - If NO: project-memory creates it automatically
- [ ] Is `docs/adr/ARCHITECTURE.md` documented?
  - If NO: project-memory creates template, you fill it in
- [ ] Is `docs/adr/TESTS.md` documented?
  - If NO: project-memory creates template with frameworks from your stack

---

## 🎯 Flow 1: Implement New Feature

**Total time**: 30-90 min (depends on complexity)

### Step 1: Invoke project-memory (5 min)

```bash
/harness-kit:project-memory
```

**You provide:**
- Description: "Add multi-factor authentication"
- Which document to update: ARCHITECTURE.md (adds auth layer)

**Result:**
- `docs/adr/ARCHITECTURE.md` updated with MFA pattern
- Cross-references generated
- **Know**: What's the stack? What patterns already exist?

---

### Step 2: Invoke scope-refinement (10-15 min)

```bash
/harness-kit:scope-refinement
```

**You provide:**
- Scope: "Multi-factor authentication (MFA) with TOTP"
- Project paths: `/c/Users/romab/Codigo/your-project`
- Domain name: `mfa-totp`
- Rules: "TOTP required only for admin"

**Skill executes:**
1. Problem Space (Why MFA? Which users? SLA?)
2. Context Map (Which contexts touch? Auth, User, Admin?)
3. Tactical Design (Aggregate: OTPCode, ValueObject: Secret?)
4. Test Scenarios (Happy path, wrong code, timeout)

**Result:**
```
docs/specs/mfa-totp/
├── 001-problem-space.md        ← Business context
├── 002-context-map.md          ← Interactions
├── 003-tactical-design.md      ← Structure
└── 004-test-scenarios.md       ← Gherkin/BDD
```

**Know**: Exactly what to test and why (before code).

---

### Step 3: Invoke tdd-orchestrator (30-60 min)

```bash
/harness-kit:tdd-orchestrator
```

**Skill coordinates RED → GREEN → REFACTOR:**

```bash
# Internal: tdd-orchestrator executes its RED phase

## RED
npm test
# ❌ error TS2304: Cannot find name 'OTPValidator'

## Write test (RED phase):
describe('OTPValidator', () => {
  test('should validate correct TOTP code', () => {
    const validator = new OTPValidator(secret);
    const result = validator.validate(code);
    expect(result).toBe(true);
  });
  
  test('should reject expired code', () => {
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

**Skill automatically executes:**
```
After each GREEN cycle → tdd-orchestrator validation gate
         ↓
All tests passing 100%? ✅

End of RED→GREEN→REFACTOR cycle → project-memory
         ↓
Update docs/adr/TESTS.md with new tests
```

**Result:**
- Code 100% tested
- Document updated
- **Know**: Each line of code has a test

---

### Step 4: Continue on TDD-Orchestrator for Automatic Harness-Tracer

> **Note:** At the end of the process, the TDD-Orchestrator should execute the `/harness-kit:harness-tracer` skill. If it fails to run automatically, you must execute it manually.

```bash
[tdd-orchestrator ends]
↓
[automatic] /harness-kit:harness-tracer
```

**Tracer creates:**
```
docs/harness-history/traces/session-2026-05-22-001/
├── metadata.md
│   skill_used: tdd-orchestrator
│   agent: developer-backend
│   task_summary: Implement TOTP authentication
│   duration: long (> 60 min)
│
├── steps.md
│   # Skill Chain
│   project-memory → scope-refinement → tdd-orchestrator → the-grumpy-tech-lead
│
│   # Action Sequence
│   | 1 | Read docs/adr/ARCHITECTURE.md | Read | success |
│   | 2 | Read docs/specs/mfa-totp/ | Read | success |
│   | 3 | Wrote test 1 (happy path) | Write | success |
│   | 4 | tdd-orchestrator executed RED phase | Chain | RED ✅ |
│   | 5 | Implemented OTPValidator | Edit | success |
│   | 6 | Cycle 1 passed | Bash | GREEN ✅ |
│   | 7 | Refactored to classes | Edit | success |
│   | 8 | Cycle 1 still passes | Bash | REFACTOR ✅ |
│   | 9 | Wrote test 2 (previous period) | Write | success |
│   | 10| Cycle 2: RED | Bash | RED ✅ |
│   | 11| Implemented tolerance | Edit | success |
│   | 12| Cycle 2: GREEN | Bash | GREEN ✅ |
│   | ... | (more tests/cycles) | ... | ... |
│   | 25| the-grumpy-tech-lead raised points | Eval | 5 points |
│   | 26| Implemented rate-limiting | Edit | success |
│   | 27| All cycles still pass | Bash | SUCCESS ✅ |
│
├── score.md
│   tdd_cycles: 3              ← 3 times RED→GREEN→REFACTOR complete
│   iterations_to_pass: 2      ← 2 test runs until 100%
│   grumpy_open_points: 5      ← 5 points raised
│   context_docs_read: 4       ← docs read
│   skill_chain_length: 4      ← 4 skills invoked
│   deviations: 0              ← no deviations
│   blockers_hit: 0            ← no blockers
│
└── verdict.md
    # Session Verdict
    
    ## What Worked Well
    - Scope-refinement very useful for understanding test cases
    - TDD natural for temporal code (understood requirements before)
    - Tech-lead questions revealed missing rate-limiting
    
    ## What Caused Friction
    - TOTP specification complex (timezone, tolerance window)
    - Recovery codes added extra cycles
    - Debugging Date() in tests was slow
    
    ## Hypothesis
    "Maybe tech-lead review in the MIDDLE of implementation (after cycle 1)
     would have saved time (wouldn't have implemented rate-limiting wrong)"
    
    ## Recommended Change
    "Invoke the-grumpy-tech-lead after first RED→GREEN,
```

---

### Step 5: Invoke the-grumpy-tech-lead (10-15 min)

```bash
/harness-kit:the-grumpy-tech-lead
```

**Skill questions:**

```
Tech Lead Analysis: Authentication with temporal dependency

Open Points (Socratic Method):
1. Did you test with different timezone?
   Does TOTP work if server and client have clock skew?
   Should we accept ±30s tolerance?

2. What if TOTP expires in 2s and validation takes 10s?
   What about accepting code from previous period too?

3. Recovery codes: What if user loses authenticator access?
   Have backup codes? How to store securely?

4. Rate limiting: How many attempts before blocking?
   30 seconds = only 2 attempts? Too restrictive?
   What about exponential delay?

5. Logging: What failure attempt info is recorded?
   Sensitive logs shouldn't go to stderr (security risk).
```

**You resolve (via new TDD cycle):**

```javascript
// New test: accept code from previous period
test('should accept code from previous period', () => {
  const code1 = validator.generateCode(); // current period
  const code0 = validator.generateCode(-30); // previous period
  
  // After 30s passed, code1 is expired
  setTimeout(() => {
    expect(validator.validate(code1)).toBe(false);
    expect(validator.validate(code0)).toBe(true); // ← tolerance
  }, 31000);
});

// Implementation with tolerance
validate(code: string): boolean {
  const now = Date.now();
  const current = this.generateCode(now);
  const previous = this.generateCode(now - 30000);
  
  return (code === current || code === previous) && 
         this.hasTimeWindowPassed();
}

// New test: rate limiting
test('should block after 5 attempts in 60s', () => {
  for (let i = 0; i < 5; i++) {
    expect(validator.validate('000000')).toBe(false); // each fail
  }
  
  expect(() => validator.validate('123456'))
    .toThrow('Too many attempts');
});
```

**Result:**
- More robust code
- Edge cases covered
- **Know**: What are the systemic risks?

---

## 🤖 Flow 2: Optimize Harness

**When to run**: Automatically triggered by the **`meta-harness-agent`** routing logic. Manually invoke when needed.

### Agent Routing Rules (`meta-harness-agent`)

The `meta-harness-agent` selects which skill to run based on the following rules:

| Trigger | Skill | Rule |
|:---|:---|:---|
| **Default** | `harness-tracer` | Always — records the session trace after every development cycle |
| **Count % 5 == 0** | `harness-evaluator` | When the number of session folders in `docs/harness-history/traces/` is a multiple of 5 (5, 10, 15, …) |
| **Explicit request** | `meta-harness` | Only when the user explicitly asks for an optimization candidate or promotion |

> To know if `harness-evaluator` has already run for the current trace count, check whether `pareto-frontier.md` has a timestamp matching the latest session. If the trace count is a multiple of 5 but the frontier is outdated, re-run manually.

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

## 📊 Quick Decision Matrix

| Goal | Use This | Time |
|------|----------|------|
| Understand architecture | `/harness-kit:project-memory` | 5 min |
| Design feature (DDD) | `/harness-kit:scope-refinement` | 15 min |
| Implement + TDD | `/harness-kit:tdd-orchestrator` | 30-60 min |
| Review architecture | `/harness-kit:the-grumpy-tech-lead` | 10 min |
| Analyze patterns | `/harness-kit:harness-evaluator` | 10 min |
| Improve skills | `/harness-kit:meta-harness` | 5 min |

---

## ⏱️ Timeline Example: 09:00–10:05

```
09:00 — Start Session
  └─ You: "Implement coupon validation"

09:05 — project-memory (5 min)
  ├─ Reads docs/adr/ARCHITECTURE.md
  ├─ Identifies: "exists validation layer"
  └─ Advice: "Add to existing ValidatorService"

09:20 — scope-refinement (15 min)
  ├─ Problem Space: "Reduce fraud"
  ├─ Context Map: "Coupon ↔ Cart ↔ Payment"
  ├─ Tactical Design: "CouponValidator aggregate"
  └─ Test Scenarios: "4 test cases in Gherkin"

10:00 — tdd-orchestrator (40 min)
  ├─ RED: Failed test for coupon validation
  ├─ GREEN: Implemented CouponValidator
  ├─ REFACTOR: Extracted discount calculation
  ├─ RED: Failed test for expired coupon
  ├─ GREEN: Added expiration check
  ├─ REFACTOR: Added rate limiting
  └─ All tests passing ✅

10:05 — the-grumpy-tech-lead (5 min, overlapped)
  ├─ "What about timezone handling?"
  ├─ "How do you handle 2 coupons on same order?"
  └─ [You note: fix in next session]

10:05 — harness-tracer (automatic)
  └─ Records session to docs/harness-history/traces/session-001/

STATUS: ✅ Complete in 65 minutes
```

---

## 🚨 Troubleshooting

| Problem | Solution |
|---------|----------|
| "docs/ folder doesn't exist" | Run `/harness-kit:project-memory` first |
| "Tests take forever to run" | Check `docs/adr/TESTS.md` — too many integration tests? |
| "Tech-lead raises too many points" | That's good! Means code needs hardening. Focus on highest-risk items. |
| "Meta-harness gives no suggestions" | Ensure at least 5 session folders exist in `docs/harness-history/traces/` before `harness-evaluator` triggers. |
| "Score went down after change" | Revert candidate. Data might be noisy. Collect more samples. |
| "Feature is BLOCKED — what now?" | `BLOCKED` means the failure causes a crash or breaks core functionality. Must be resolved before project completion. |
| "Feature is FAILED — can I continue?" | Yes. `FAILED` means a non-blocking issue (e.g., minor bug or security advisory). Development continues to other features. |
| "harness-evaluator didn't run at session 5" | Count folders in `docs/harness-history/traces/`. If count is a multiple of 5, invoke `/harness-kit:harness-evaluator` skill manually. |

---

## 🎓 Summary

1. **Daily**: Use project-memory → scope-refinement → tdd-orchestrator → the-grumpy-tech-lead
2. **Every session**: `meta-harness-agent` automatically runs `harness-tracer` to record execution traces
3. **Every 5th trace** (count % 5 == 0): `harness-evaluator` runs automatically to update the Pareto frontier
4. **On explicit request**: Invoke `meta-harness` to search for optimization candidates and propose skill improvements
5. **Result**: Skills evolve with real data, not guesswork
