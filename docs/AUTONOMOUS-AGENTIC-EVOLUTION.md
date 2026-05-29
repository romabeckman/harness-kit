# Autonomous Agentic Process Evolution

**Goal:** Transform HarnessKit from a semi-autonomous system (manual skill invocations) into a **fully autonomous process** that executes continuous loops of planning → implementation → validation until the product is complete.

---

## CURRENT STATE

### Status: Autonomous-Ready (Ecosystem Fully Integrated)

All 9 skills and 7 agent personas are fully implemented, containing structured JSON outputs, autonomous mode switches, and explicit context injection contracts. The system is ready and validated for end-to-end sovereign operations.

**Implemented Skills:**

| Skill | Role | Autonomous Mode | Main Output / Artifact | Designated Agent |
|:---|:---|:---:|:---|:---|
| `autonomous-orchestrator` | Sovereign loop manager | N/A | `BACKLOG.md`, `DEVELOPMENT-STATE.md`, `DECISIONS.md` | Sovereign Engine |
| `scope-refinement` | DDD analysis (4 phases) | Yes | `003-*-tactical-design.md`, `004-*-test-scenarios.md` | `software-architect` |
| `tdd-orchestrator` | RED → GREEN → REFACTOR | Yes | `TDD-OUTPUT.json` | `developer-backend` / `developer-frontend` / `developer-debugging` |
| `the-grumpy-tech-lead` | Socratic code review | Yes | `{ score, openPoints, architectureTip }` | `harness-tech-lead` |
| `adversarial-qa` | Security + edge case QA | Yes | `{ score, vulnerabilities, edgeCasesMissed }` | `harness-qa` |
| `harness-tracer` | Session recording | Yes | Markdown session traces in `/traces/` | Active Agent in context |
| `harness-evaluator` | Pareto frontier analysis | Yes | `pareto-frontier.md` report | `meta-harness-agent` |
| `meta-harness` | Skill optimization proposer | Yes | Optimization SKILL candidates (`{ candidateId }`) | `meta-harness-agent` |
| `project-memory` | Documentation specialist | N/A | Baseline docs (`README.md`, `ARCHITECTURE.md`, `TESTS.md`) | `software-architect` / Human |

### Implemented Agent Ecosystem

HarnessKit implements a set of specialized, isolated agent personas configured to perform dedicated tasks in the loop. These agents are mapped to the skills as follows:

| Agent Persona | File Path | Main Loop Responsibility | Handled Skill |
|:---|:---|:---|:---|
| **Software Architect** | [software-architect.md](file:///c:/Users/romab/Codigo/harness-kit/agents/software-architect.md) | Synthesizes product specifications, maps domains using DDD, and refines scope. | `scope-refinement`, `project-memory` |
| **Developer Backend** | [developer-backend.md](file:///c:/Users/romab/Codigo/harness-kit/agents/developer-backend.md) | Implements robust backend functionality, APIs, and databases using TDD. | `tdd-orchestrator` |
| **Developer Frontend** | [developer-frontend.md](file:///c:/Users/romab/Codigo/harness-kit/agents/developer-frontend.md) | Implements user interfaces, responsive design, and frontend TDD contracts. | `tdd-orchestrator` |
| **Developer Debugging** | [developer-debugging.md](file:///c:/Users/romab/Codigo/harness-kit/agents/developer-debugging.md) | Specializes in root-cause debugging and resolving test failures. | `tdd-orchestrator` |
| **Harness Tech Lead** | [harness-tech-lead.md](file:///c:/Users/romab/Codigo/harness-kit/agents/harness-tech-lead.md) | Conducts critical Socratic reviews, validating security, scalability, and patterns. | `the-grumpy-tech-lead` |
| **Harness QA** | [harness-qa.md](file:///c:/Users/romab/Codigo/harness-kit/agents/harness-qa.md) | Acts as an adversarial validator, seeking security leaks and edge-case cracks. | `adversarial-qa` |
| **Meta-Harness Agent** | [meta-harness-agent.md](file:///c:/Users/romab/Codigo/harness-kit/agents/meta-harness-agent.md) | Analyzes traces and Pareto frontier to propose and validate skill updates. | `harness-evaluator`, `meta-harness` |

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
| `${scoreThresholdTL}` | Persistent in `BOOTSTRAP-CONFIG.md` | `0.70` |

### orchestrator → adversarial-qa
| Variable | Source | Example |
|----------|--------|---------|
| `${featureId}` | BACKLOG.md ID column | "F001" |
| `${domain}` | BACKLOG.md Domain column | "user_authentication" |
| `${projectPaths}` | Collected during BOOTSTRAP | "/home/user/projects/my-service" |
| `${scoreThresholdAdv}` | Persistent in `BOOTSTRAP-CONFIG.md` | `0.70` |

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

### Phase 6: Integration & Edge Cases — PARTIALLY COMPLETED
- [ ] Retry logic for transient failures (subagent crash, network error)
- [ ] Escalation with notification when feature BLOCKED
- [x] Mid-loop crash recovery (autonomous-orchestrator reads `DEVELOPMENT-STATE.md` to resume from the last completed phase)
- [x] Logging and observability (atomic disk writes to `DEVELOPMENT-STATE.md`, `BACKLOG.md`, and `DECISIONS.md`)

### Phase 7: Real Project Validation — NOT STARTED
- [ ] Select pilot project
- [ ] Run full autonomous loop
- [ ] Measure: total time, quality, issues found
- [ ] Adjustments based on feedback

### Phase 8: Documentation & Release — COMPLETED
- [x] Update README.md (added sovereign automation, 5-step sequence, grumpy tech lead, and quality gate highlights)
- [x] Create automated loop playbook (`docs/workflow/AUTONOMOUS-ORCHESTRATOR.md`)
- [x] Create detailed architecture guides (`docs/workflow/META-HARNESS.md` and `docs/workflow/AUTONOMOUS-ORCHESTRATOR.md` 4-layer architecture definition)
- [x] Release v1.0 (all 9 core skills fully implemented and integrated)

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
- **Autonomous Orchestrator Workflow:** [docs/workflow/AUTONOMOUS-ORCHESTRATOR.md](file:///c:/Users/romab/Codigo/harness-kit/docs/workflow/AUTONOMOUS-ORCHESTRATOR.md)
- **Conceptual & Architectural Foundation:** [docs/workflow/META-HARNESS.md](file:///c:/Users/romab/Codigo/harness-kit/docs/workflow/META-HARNESS.md)
- **Daily Use Playbook:** [docs/workflow/PLAYBOOK-DAILY-USE.md](file:///c:/Users/romab/Codigo/harness-kit/docs/workflow/PLAYBOOK-DAILY-USE.md)
- **Skills Specifications:**
  - `autonomous-orchestrator`: [skills/autonomous-orchestrator/SKILL.md](file:///c:/Users/romab/Codigo/harness-kit/skills/autonomous-orchestrator/SKILL.md)
  - `scope-refinement`: [skills/scope-refinement/SKILL.md](file:///c:/Users/romab/Codigo/harness-kit/skills/scope-refinement/SKILL.md)
  - `tdd-orchestrator`: [skills/tdd-orchestrator/SKILL.md](file:///c:/Users/romab/Codigo/harness-kit/skills/tdd-orchestrator/SKILL.md)
  - `the-grumpy-tech-lead`: [skills/the-grumpy-tech-lead/SKILL.md](file:///c:/Users/romab/Codigo/harness-kit/skills/the-grumpy-tech-lead/SKILL.md)
  - `adversarial-qa`: [skills/adversarial-qa/SKILL.md](file:///c:/Users/romab/Codigo/harness-kit/skills/adversarial-qa/SKILL.md)
  - `harness-tracer`: [skills/harness-tracer/SKILL.md](file:///c:/Users/romab/Codigo/harness-kit/skills/harness-tracer/SKILL.md)
  - `harness-evaluator`: [skills/harness-evaluator/SKILL.md](file:///c:/Users/romab/Codigo/harness-kit/skills/harness-evaluator/SKILL.md)
  - `meta-harness`: [skills/meta-harness/SKILL.md](file:///c:/Users/romab/Codigo/harness-kit/skills/meta-harness/SKILL.md)
  - `project-memory`: [skills/project-memory/SKILL.md](file:///c:/Users/romab/Codigo/harness-kit/skills/project-memory/SKILL.md)

---

## NEXT STEPS

1. **Phase 6 Completion** — Implement retry logic for transient failures and automated escalation alerts upon blocked features.
2. **Phase 7 (Real Project Validation)** — Deploy on pilot project, track loop metrics (total duration, composite scores, reworks count), and optimize thresholds.
3. **Continuous Optimization Loop** — Collect trace history of autonomous loops and utilize `meta-harness` to auto-tune expert SKILL behaviors.
