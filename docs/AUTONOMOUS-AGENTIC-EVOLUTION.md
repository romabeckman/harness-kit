# Autonomous Agentic Process Evolution

**Goal:** Transform HarnessKit from a semi-autonomous system (manual skill invocations) into a **fully autonomous process** that executes continuous loops of planning → implementation → validation until the product is complete.

---

## CURRENT STATE

### Status: Autonomous-Ready (Communication Protocol Implemented)

All 9 skills are implemented with structured JSON outputs, autonomous mode switches, and explicit context injection contracts. The system is ready for real-project validation.

**Implemented Skills:**

| Skill | Role | Autonomous Mode | JSON Output |
|-------|------|:---:|:---:|
| `autonomous-orchestrator` | Sovereign loop manager | N/A (is the orchestrator) | N/A |
| `scope-refinement` | DDD analysis (4 phases) | Yes | N/A (markdown docs) |
| `tdd-orchestrator` | RED → GREEN → REFACTOR | Yes | `TDD-OUTPUT.json` |
| `the-grumpy-tech-lead` | Socratic code review | Yes | `{ score, openPoints }` |
| `adversarial-qa` | Security + edge case QA | Yes | `{ score, vulnerabilities }` |
| `harness-tracer` | Session recording | Yes | N/A (markdown traces) |
| `harness-evaluator` | Pareto frontier analysis | Yes | N/A (markdown report) |
| `meta-harness` | Skill optimization proposer | Yes | `{ candidateId, status }` |
| `project-memory` | Documentation specialist | N/A | N/A |

---

## ARCHITECTURE: 4 Layers

### Layer 1: Product State Machine

Stores development state, prioritization decisions, and completion criteria.

**Artifacts:**
```
docs/product/
├── BACKLOG.md              ← Feature list with Domain column + status
├── DEVELOPMENT-STATE.md    ← Per-feature phase tracking with scores
├── COMPLETION-CRITERIA.md  ← Definition of Done
└── DECISIONS.md            ← Audit trail of autonomous decisions
```

### Layer 2: Autonomous Orchestrator

Implements the main loop and coordinates all skills via Context Injection Protocol.

**Algorithm:**
```
BOOTSTRAP:
  1. Acquire scope/PRD (ASK ONCE, then never again)
  2. Acquire ${projectPaths} (ASK ONCE)
  3. Synthesize BACKLOG.md with Domain column (ID → snake_case mapping)
  4. Initialize DEVELOPMENT-STATE.md, COMPLETION-CRITERIA.md, DECISIONS.md

LOOP (for each NOT_STARTED feature in priority order):
  Phase A — PLANNING:
    Invoke scope-refinement passing: ${scope}, ${projectPaths}, ${domain}, ${rules}
    Verify: 004-*-test-scenarios.md exist for all projects
  
  Phase B — IMPLEMENTATION:
    Invoke tdd-orchestrator passing: ${featureId}, ${domain}, ${projectPaths}
    + spec docs: 003-tactical-design.md, 004-test-scenarios.md
    + REWORK-LOG.md (if retry)
    Verify: TDD-OUTPUT.json generated
  
  Phase C — VALIDATION:
    Invoke the-grumpy-tech-lead passing: ${featureId}, ${domain}, ${projectPaths}
    → Score A (from score field)
    Invoke adversarial-qa passing: ${featureId}, ${domain}, ${projectPaths}
    → Score B (from score field)
    
    Decision Gate:
      PASS:  Score A >= 0.70 AND Score B >= 0.70 → COMPLETED
      RETRY: Reworks < 2 → append findings to REWORK-LOG.md → restart Phase B
      BLOCK: Reworks >= 2 → BLOCKED, move to next feature
    
    Log every decision in DECISIONS.md
  
  Phase D — STATE, EVOLUTION & AUTO-TUNING:
    Invoke harness-tracer passing: ${skill_name}, ${agent_name}, ${task_summary}
    AUTO-TUNING GATE:
      If completedCycles % 10 == 0 AND completedCycles > 0:
        Log AUTO-TUNING in DECISIONS.md
        Invoke harness-evaluator → updates pareto-frontier.md
        Invoke meta-harness → proposes/promotes skill candidate
        Persist completedCycles to BOOTSTRAP-CONFIG.md
    Check COMPLETION-CRITERIA.md
    If backlog exhausted → final harness-evaluator + meta-harness
    If features remain → loop back to Phase A

DONE:
  All features COMPLETED or BLOCKED + criteria met → PRODUCT READY
```

### Layer 3: Enhanced Skills

#### 3a. scope-refinement
- 4 phases: Problem Space → Context Map → Tactical Design → Test Scenarios
- Autonomous mode: reads `${scope}`, `${projectPaths}`, `${domain}`, `${rules}` from context injection
- Per-project outputs: `003-${PROJECT_NAME}-tactical-design.md`, `004-${PROJECT_NAME}-test-scenarios.md`
- MACHINE-READABLE.json **removed** — 004-test-scenarios.md serves as the machine-readable contract

#### 3b. tdd-orchestrator
- Autonomous mode: reads `${featureId}`, `${domain}`, `${projectPaths}` from context injection
- RED phase driven by `004-*-test-scenarios.md` (pre-specified scenarios from scope-refinement)
- GREEN phase guided by `003-*-tactical-design.md` (ordered development tasks)
- Consumes `REWORK-LOG.md` on retry cycles

Output (`docs/specs/${domain}/TDD-OUTPUT.json`):
```json
{
  "featureId": "F001",
  "status": "SUCCESS",
  "metrics": {
    "totalTests": 24,
    "passed": 24,
    "failed": 0,
    "coverage": 0.89
  },
  "reworksCount": 0
}
```

#### 3c. the-grumpy-tech-lead
- Autonomous mode: reads `${featureId}`, `${domain}`, `${projectPaths}` from context injection
- Also reads `003-*-tactical-design.md` to validate architectural alignment
- Score used by orchestrator Decision Gate

Output:
```json
{
  "featureId": "F001",
  "score": 0.94,
  "openPoints": [
    "Socratic question about scalability",
    "Socratic question about security"
  ],
  "architectureTip": "Brief guidance"
}
```

#### 3d. adversarial-qa
- Autonomous mode: reads `${featureId}`, `${domain}`, `${projectPaths}` from context injection
- Reads `001-problem-space.md`, `002-context-map.md`, `004-*-test-scenarios.md` for boundary analysis
- Score used by orchestrator Decision Gate

Output:
```json
{
  "featureId": "F001",
  "score": 0.96,
  "passedAdversarial": true,
  "vulnerabilities": [],
  "edgeCasesMissed": []
}
```

### Layer 4: Persistence & Monitoring

**docs/product/** — Product lifecycle
```
├── BACKLOG.md                    ← Dynamic, updated by orchestrator (includes Domain column)
├── DEVELOPMENT-STATE.md          ← Per-feature status with scores
├── COMPLETION-CRITERIA.md        ← Definition of Done
└── DECISIONS.md                  ← Audit trail of every ACCEPT/RETRY/BLOCK
```

**docs/specs/{domain}/** — Feature specifications (DDD + TDD outputs)
```
├── 001-problem-space.md
├── 002-context-map.md
├── 003-${PROJECT_NAME}-tactical-design.md  (per project)
├── 004-${PROJECT_NAME}-test-scenarios.md   (per project)
├── TDD-OUTPUT.json                         (generated by tdd-orchestrator)
└── REWORK-LOG.md                           (generated on retry cycles)
```

**docs/harness-history/** — Execution history (existing)
```
├── traces/
├── candidates/
├── baseline.md
├── pareto-frontier.md
└── config.md
```

---

## CONTEXT INJECTION PROTOCOL

Defines exactly what the orchestrator passes to each skill in autonomous mode.

### orchestrator → scope-refinement
| Variable | Source | Example |
|----------|--------|---------|
| `${scope}` | BACKLOG.md Title + Description | "User Authentication with JWT tokens" |
| `${projectPaths}` | Collected during BOOTSTRAP | "/home/user/projects/my-service" |
| `${domain}` | BACKLOG.md Domain column | "user_authentication" |
| `${rules}` | Optional constraints | "No additional rules provided" |

### orchestrator → tdd-orchestrator
| Variable | Source | Example |
|----------|--------|---------|
| `${featureId}` | BACKLOG.md ID column | "F001" |
| `${domain}` | BACKLOG.md Domain column | "user_authentication" |
| `${projectPaths}` | Collected during BOOTSTRAP | "/home/user/projects/my-service" |
| Spec docs | `docs/specs/${domain}/003-*`, `004-*` | Implementation + test blueprints |
| Rework context | `docs/specs/${domain}/REWORK-LOG.md` | Only on retry cycles |

### orchestrator → the-grumpy-tech-lead
| Variable | Source | Example |
|----------|--------|---------|
| `${featureId}` | BACKLOG.md ID column | "F001" |
| `${domain}` | BACKLOG.md Domain column | "user_authentication" |
| `${projectPaths}` | Collected during BOOTSTRAP | "/home/user/projects/my-service" |

### orchestrator → adversarial-qa
| Variable | Source | Example |
|----------|--------|---------|
| `${featureId}` | BACKLOG.md ID column | "F001" |
| `${domain}` | BACKLOG.md Domain column | "user_authentication" |
| `${projectPaths}` | Collected during BOOTSTRAP | "/home/user/projects/my-service" |

### orchestrator → harness-tracer
| Variable | Source | Example |
|----------|--------|---------|
| `${skill_name}` | Fixed | "autonomous-orchestrator" |
| `${agent_name}` | Active agent name | "developer-backend" |
| `${task_summary}` | Generated from loop state | "Autonomous loop: 2 completed, 0 blocked, 2 remaining" |

---

## IMPLEMENTATION ROADMAP (8 Phases)

### Phase 1: Foundation — DONE
- [x] Create `ProductBacklog` structure (BACKLOG.md with Domain column)
- [x] Create `CompletionCriteria` (completion requirements)
- [x] Create `DEVELOPMENT-STATE.md` tracking with scores
- [x] Create `autonomous-orchestrator` skeleton
- [x] Create `DECISIONS.md` audit trail

### Phase 2: Orchestrator Logic — DONE
- [x] Planning loop (scope-refinement delegation with context injection)
- [x] Implementation loop (tdd-orchestrator delegation with spec docs)
- [x] Validation loop (the-grumpy-tech-lead + adversarial-qa + decision gate)
- [x] Decision gate logic (score threshold >= 0.70, rework count, blocking)
- [x] JSON Extraction Protocol (defensive parsing)

### Phase 3: Skill Upgrades — DONE
- [x] Upgrade `scope-refinement` → autonomous mode + per-project outputs (MACHINE-READABLE.json removed)
- [x] Upgrade `tdd-orchestrator` → autonomous mode + TDD-OUTPUT.json + reads spec docs
- [x] Upgrade `the-grumpy-tech-lead` → autonomous mode + JSON with score
- [x] Create `adversarial-qa` skill → autonomous mode + JSON verdict
- [x] Context Injection Protocol defined for all skill-to-skill communication

### Phase 4: State Management — DONE
- [x] Orchestrator updates DEVELOPMENT-STATE.md on every phase transition
- [x] Orchestrator updates DECISIONS.md on every ACCEPT/RETRY/BLOCK
- [x] Backlog progression with cascade block on dependencies
- [x] Completion checker verifies COMPLETION-CRITERIA.md

### Phase 5: Harness Optimization Loop — DONE
- [x] `harness-evaluator` reads traces and computes Pareto frontier
- [x] `meta-harness` proposes targeted improvements with diagnosis protocol
- [x] Adapt evaluator metrics for autonomous loop traces (featureId, reworksCount, composite scores)
- [x] Auto-tuning validation (run harness-evaluator + meta-harness every 10 completed cycles)

### Phase 6: Integration & Edge Cases — NOT STARTED
- [ ] Retry logic for transient failures (subagent crash, network error)
- [ ] Escalation with notification when feature BLOCKED
- [ ] Edge case tests (empty backlog, timeout, mid-loop crash recovery)
- [ ] Logging and observability (`docs/harness-history/monitoring.md`)

### Phase 7: Real Project Validation — NOT STARTED
- [ ] Select pilot project
- [ ] Run full autonomous loop
- [ ] Measure: total time, quality, issues found
- [ ] Adjustments based on feedback

### Phase 8: Documentation & Release — NOT STARTED
- [ ] Update README.md
- [ ] Create AUTONOMOUS-PLAYBOOK.md (quick start)
- [ ] Create ARCHITECTURE.md (detailed design)
- [ ] Release v1.0

---

## RISKS & MITIGATIONS

| Risk | Mitigation |
|------|-----------|
| **Infinite loops / Deadlock** | BLOCKED counter (max 2 reworks) + cascade block on dependencies |
| **Low accumulated quality** | High threshold (score >= 0.70, coverage >= 85%) |
| **Cost (API calls)** | Batch processing; spec docs reduce redundant analysis |
| **Feature creep** | Backlog fixed at BOOTSTRAP; changes only via DECISIONS.md |
| **State inconsistency** | Atomic writes to docs; persistence-first rule |

### Human Intervention Points (Fallbacks)

1. **Feature BLOCKED** (after 2 rework attempts) → Logged in DECISIONS.md, move to next feature
2. **Average score dropping** (trend analysis) → Pause & notify
3. **Critical security issue** → Immediate escalation

---

## REFERENCES

- **Meta-Harness paper:** https://arxiv.org/abs/2603.28052
- **DDD scope-refinement:** [skills/scope-refinement/SKILL.md](../skills/scope-refinement/SKILL.md)
- **TDD orchestrator:** [skills/tdd-orchestrator/SKILL.md](../skills/tdd-orchestrator/SKILL.md)
- **Autonomous orchestrator:** [skills/autonomous-orchestrator/SKILL.md](../skills/autonomous-orchestrator/SKILL.md)

---

## NEXT STEPS

1. **Phase 5 completion** — Adapt harness-evaluator metrics for autonomous loop data
2. **Phase 6** — Add retry logic, escalation, crash recovery
3. **Phase 7** — Run on pilot project, collect real-world feedback
4. **Iterate** — Use meta-harness to optimize skills based on accumulated traces
