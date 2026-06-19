# 🏗️ Architectural and Flow Guide: Harness Optimization with HarnessKit

This document consolidates the conceptual architecture and operational flow of **HarnessKit**, a practical implementation inspired by the research paper [Meta-Harness: End-to-End Optimization of Model Harnesses](https://arxiv.org/abs/2603.28052). This system establishes a continuous optimization loop over the skills and execution chains used by development agents, driven by concrete execution data.

---

## 1. The Continuous Optimization Loop (Meta-Harness Concept)

HarnessKit automates the evolution of the developer's workflow through a closed feedback loop (*Optimization Loop*). Instead of adjusting prompts empirically, the system treats tool configuration as a population optimization problem.

### The Harness Optimization Algorithm
1. **Initialization:** The initial population $\mathcal{H}$ is established using the baseline skills.
2. **Evaluation:** Each skill execution is evaluated, generating execution traces and scores stored in the filesystem $\mathcal{D}$.
3. **Improvement Iteration:**
   * The proposer component reads the history contained in $\mathcal{D}$ (source code, traces, and scores).
   * A new harness variant/candidate is proposed.
   * The new candidate is evaluated in a practical environment.
   * New results feed into $\mathcal{D}$ to calculate the **Pareto frontier**.
4. **Conclusion:** The best validated harness from the Pareto frontier is promoted to the new baseline.

### Conceptual Mapping

| Paper Concept (Meta-Harness) | Real Implementation in HarnessKit |
| :--- | :--- |
| Proposer (Agent) | `meta-harness` skill |
| Filesystem / History ($\mathcal{D}$) | `docs/harness-history/` directory |
| Execution Trace | `steps.md` files inside each session |
| Scores per Candidate | `score.md` files (Composite metrics) |
| Causal Diagnosis | Combined analysis of `meta-harness` + `verdict.md` |
| Population / Improvement Proposal | Configurations in `candidates/vXXX/SKILL.md` |
| Pareto Frontier | Report generated via `harness-evaluator` |

---

## 2. The 3-Layer Architecture

The HarnessKit ecosystem is structured modularly to isolate human interaction, tool logic, and the system's historical state.

### Layer 1: Developer (Execution Interface)
Represents the entry point where execution triggers and control commands are fired during daily routines. The developer chains skills based on delivery needs (e.g., feature implementation, bug fixing).

### Layer 2: Skills (Execution & Automation Modules)
* **`project-memory`:** Detects the tech stack and maintains living documentation for architecture (`ARCHITECTURE.md`) and tests (`TESTS.md`).
* **`scope-refinement`:** Applies Domain-Driven Design (DDD) phases to break down the problem (Problem Space, Context Map, Tactical Design, and Test Scenarios) before writing code.
* **`tdd-orchestrator`:** Coordinates the strict Test-Driven Development cycle (RED → GREEN → REFACTOR).
* **`the-grumpy-tech-lead`:** Acts socratically by raising open points, performance risks, and SOLID violations without giving ready-made answers.
* **`adversarial-qa`:** Audits implementations for edge cases, boundary faults, and security vulnerabilities.
* **`autonomous-orchestrator`:** Sovereign manager of the entire feature backlog and continuous development cycle.
* **`harness-tracer`:** Automated component that runs transparently at the end of sessions to save execution traces and telemetry.
* **`harness-evaluator`:** Aggregates history, computes composite metrics, and ranks the most successful execution chains on the Pareto frontier.
* **`meta-harness`:** The analytical optimization engine that reads the full history, diagnoses skill bottlenecks, and proposes target prompt instruction changes.

### Layer 3: Filesystem $\mathcal{D}$ (Persistence and State)
The physical structure that centralizes acquired knowledge and generated variations:
```text
docs/harness-history/
├── pareto-frontier.md      ← Ranked best configurations (updated by harness-evaluator)
├── /traces/                ← Execution history (one folder per session — count drives routing)
│   └── session-YYYY-MM-DD-NNN/
│       ├── metadata.md     ← Skill identifiers and agent profile
│       ├── input.md        ← Original task scope
│       ├── steps.md        ← Chronological action log
│       ├── score.md        ← Raw session metrics
│       └── verdict.md      ← Qualitative self-evaluation of the run
└── /candidates/            ← Generated improvement branches for evaluation
    └── vXXX/
        ├── rationale.md    ← Causal hypothesis for the proposed change
        └── SKILL.md        ← Modified candidate version of the skill

```

---

## 3. Operational Flows in Practice

### FLOW 1: Daily Development (Baseline Iteration)

The standard routine used to build new features driven by tests:

1. **Context Mapping:** Execute `project-memory` to align the agent with architectural and technical patterns.
2. **Scope Design:** Call `scope-refinement` to model business aggregates and design BDD/Gherkin scenarios.
3. **TDD Cycle:** The `tdd-orchestrator` handles writing failing tests, minimal implementation to pass, and subsequent refactoring.
4. **Architectural Review:** `the-grumpy-tech-lead` evaluates the outcome critically, generating normative tests to cover hidden flaws.
5. **Tracking:** `harness-tracer` triggers automatically at the end of the cycle, logging the session trace into the filesystem.

### FLOW 2: Harness Optimization Loop (Meta-Optimization Session)

The phase where the system analytically evolves its own instructions. Routing is **automatic** based on trace count:

1. **Recording (default — every session):** The **`meta-harness-agent`** always executes `harness-tracer` to record structured traces under `docs/harness-history/traces/`.
2. **Pattern Analysis (every multiple of 5 traces):** When the trace folder count is a multiple of 5 (5, 10, 15, …), the agent automatically executes `harness-evaluator`. It computes aggregated metrics and consolidates the Pareto frontier (e.g., *"Late reviews from Tech Lead cause rework and drop the average score"*).
3. **Meta-Harness Proposal (explicit request only):** `meta-harness` is invoked only when the user explicitly requests an optimization search. It reads the diagnostics, isolates the underperforming skill, and creates a variant (e.g., `candidates/v001/SKILL.md`), modifying instructions to mitigate the bottleneck.
4. **Promotion or Rejection:** If the candidate's score consistently beats the baseline, the modified file is promoted to the active skills directory. Otherwise, the change is discarded.

---

## 4. Practical Behavior Example (8-Day Timeline)

* **Day 1 — Feature: Discount Coupon**
* Sequence: `project-memory` → `scope-refinement` → `tdd-orchestrator` → `the-grumpy-tech-lead`.
* Results: 3 TDD cycles, 5 open points from Tech Lead. **Score: 0.82**.


* **Day 2 — Bugfix: Coupon Expiration**
* Focused run via `tdd-orchestrator`. Tech Lead raises 3 points regarding sync and TTL. **Score: 0.85**.


* **Day 3 — Feature: Redis Cache Implementation**
* Highly complex session. TDD spans 4 cycles; socratic review opens 7 critical points regarding concurrency. **Score: 0.78**.


* **Days 4 to 6 — Minor Feature Additions**
* Continuous sessions generating stable historical data in `traces/`. **Moving Average Score (Sessions 1-5): 0.81**.


* **Day 7 — Active Optimization Phase (Data Analysis)**
* Running `harness-evaluator`. Diagnostics reveal that late architecture reviews on Day 3 caused destructive refactoring overhead.
* `meta-harness` trigger: Automatically creates improvement proposal `candidates/v001/`. The modification shifts instructions to invoke the Tech Lead early, right after the first functional RED→GREEN cycle.
* Practical test using candidate `v001` on a pilot task. Critical bugs are caught earlier. **Candidate v001 Score: 0.89**.


* **Day 8 — Harness Promotion and Consolidation**
* `harness-evaluator` validates the candidate sampling.
* **Verdict:** Approved with real efficiency gains ($\Delta = +0.08$). Variant `v001` becomes the new active rule and default (`baseline`) for upcoming runs.
