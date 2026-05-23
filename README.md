# 🔧 HarnessKit

> [!IMPORTANT]
> This project requires the [Superpowers](https://github.com/obra/superpowers) skill. Install it using the command:
> `/plugin install superpowers@claude-plugins-official`

HarnessKit is a complete AI-assisted software engineering methodology built on **Harness Engineering** — the principle that a reliable agent is defined as **Model (AI) + Harness (Controls)**.

It gives your coding agent a set of composable expert skills and structured agent personas that enforce discipline, consistency, and quality across the full development lifecycle: from domain modeling to TDD implementation, critical code review, and persistent project memory.

---

## Installation & Quick Commands

### Claude Code

HarnessKit is distributed as a Claude Code plugin via its own marketplace hosted on GitHub.

**Step 1 — Register the marketplace:**

```bash
/plugin marketplace add romabeckman/harness-kit
```

**Step 2 — Install the plugin:**

```bash
/plugin install harness-kit@harness-kit
```

**Step 3 — Verify installation:**

```bash
/harness-kit:project-memory --help
```

**Update later:**

```bash
/plugin update harness-kit
```

---

## Common Commands

Once installed, use these commands in your Claude Code chat:

```bash
# Setup: Initialize project documentation
/harness-kit:project-memory

# Design: Map domain using DDD before coding
/harness-kit:scope-refinement

# Develop: Test-driven implementation (RED → GREEN → REFACTOR)
/harness-kit:tdd-orchestrator

# Review: Socratic code review for systemic risks
/harness-kit:the-grumpy-tech-lead

# Optimize: Record session execution
/harness-kit:harness-tracer

# Analyze: Evaluate harness performance across sessions
/harness-kit:harness-evaluator

# Improve: Propose targeted harness improvements
/harness-kit:meta-harness
```

---

## How It Works

From the moment you start a task, HarnessKit changes how your agent thinks.

Instead of jumping straight to writing code, it guides the agent to first understand the domain, model the problem with DDD, and define test scenarios before a single line is written.

- **Feedforward (Guides):** `project-memory` and `scope-refinement` align the agent with your architecture and domain *before* execution.
- **Feedback (Sensors):** `tdd-orchestrator` validates every implementation computationally (tests), while `the-grumpy-tech-lead` validates it semantically (Socratic review).
- **Balance:** Computational validation (deterministic via tests) + Inferential validation (architectural judgment) working together.

The skills activate when relevant. Your agent just has a Harness.

---

## The Harness Workflow: 5-Step Sequence

Follow this iterative process for maximum quality and safety:

1. **Harnessing (Preparation)** — Use `project-memory` to generate and maintain `docs/README.md`, `docs/adr/ARCHITECTURE.md`, and `docs/adr/TESTS.md`. These files are the agent's persistent memory.

2. **Direction (Feedforward)** — Run `scope-refinement` to map the domain using DDD (Bounded Contexts, Aggregates, Use Cases) and define acceptance scenarios *before* any code is written.

3. **Controlled Execution (Feedback)** — Implement via `tdd-orchestrator`, enforcing RED → GREEN → REFACTOR. Every line of code is validated by a test before it's considered done.

4. **Semantic Review (Inferential)** — Use `the-grumpy-tech-lead` to review the implementation for systemic risks: N+1 queries, memory leaks, race conditions, SOLID violations, and architectural drift.

5. **Persistence** — Close by updating documentation with `project-memory` so the knowledge is inherited by future sessions.

---

## What's Inside

### 🛠️ Skills (`/skills`)

| Skill | Core Function |
| :--- | :--- |
| **Project Memory** (`project-memory`) | Generates and maintains persistent technical documentation (`docs/README.md`, `docs/adr/ARCHITECTURE.md`, `docs/adr/TESTS.md`). The agent's long-term memory. |
| **Scope Refinement** (`scope-refinement`) | DDD-based scope orchestrator. Maps Bounded Contexts, Aggregates, and Use Cases. Produces test scenarios before implementation starts. |
| **TDD Orchestrator** (`tdd-orchestrator`) | Enforces RED → GREEN → REFACTOR. Coordinates the full test-driven development cycle, blocking implementation without a failing test first. |
| **The Grumpy Tech Lead** (`the-grumpy-tech-lead`) | Senior technical reviewer. Uses Socratic questioning to expose systemic risks (N+1, leaks, race conditions, SOLID violations) without providing ready-made solutions. |
| **Harness Tracer** (`harness-tracer`) | Records structured execution traces after each session to `docs/harness-history/traces/`. Raw material for harness optimization. |
| **Harness Evaluator** (`harness-evaluator`) | Aggregates traces, computes composite scores per skill chain, and updates the Pareto frontier of best harness configurations. |
| **Meta-Harness** (`meta-harness`) | Proposer for the harness optimization loop. Reads history, diagnoses failure patterns, proposes targeted SKILL.md improvements, and guides semi-automatic evaluation. |

### 🤖 Expert Agents (`/agents`)

Pre-configured agent personas that embody specific engineering roles, designed to work with the skills above.

| Agent | Role | Focus |
| :--- | :--- | :--- |
| **Software Architect** (`software-architect`) | System Design & Refinement | DDD modeling, architectural decisions, and implementation planning. |
| **Code Reviewer** (`code-reviewer`) | Automated Audit | Sequential Git diff analysis focused on bugs, security, and performance. |
| **Developer Backend** (`developer-backend`) | Backend Engineering | Robust APIs, database modeling, and server-side logic with TDD. |
| **Developer Frontend** (`developer-frontend`) | Frontend Engineering | UI/UX implementation, accessibility, and client-side performance with TDD. |
| **Developer Debugging** (`developer-debugging`) | Root Cause Specialist | Systematic bug investigation using the "5 Whys" methodology. |
| **QA Engineer** (`qa`) | Quality Assurance | E2E testing strategy, automation, and full-flow validation. |
| **Meta-Harness Agent** (`meta-harness-agent`) | Harness Optimizer | Reads harness history filesystem, diagnoses failure patterns, proposes targeted skill improvements. |

---

## Harness Optimization Loop

Continuously improve your harness configuration based on execution data:

```
Sessions (real work)
       ↓
 harness-tracer        ← records every session automatically
       ↓
 harness-evaluator     ← aggregates scores, updates Pareto frontier
       ↓
 meta-harness          ← diagnoses patterns, proposes skill improvement
       ↓
 Human review & approval
       ↓
 Apply candidate → collect sessions → evaluate → promote or discard
       ↓
 Loop repeats
```

**How to start optimization:**

```bash
# After ≥3 sessions have been recorded by harness-tracer:
/harness-kit:harness-evaluator

# After reviewing pareto-frontier.md:
/harness-kit:meta-harness

# After applying the candidate and collecting sessions:
/harness-kit:harness-evaluator
/harness-kit:meta-harness --promote v001
```

---

## Project Documentation Setup

The `docs/` folder acts as HarnessKit's **persistent memory** for your project. It centralizes the technical knowledge that allows agents to operate autonomously and accurately across sessions.

### Required files

| File | Function |
| :--- | :--- |
| `docs/README.md` | Summary and index. The agent's main map for navigating your project. |
| `docs/adr/ARCHITECTURE.md` | Architecture rules. Prevents design decisions inconsistent with the project. |
| `docs/adr/TESTS.md` | Quality protocol. Defines the testing framework and standards. |

> **Tip:** Use `project-memory` to generate these automatically:
> ```
> /harness-kit:project-memory
> ```
> Then say: *"Generate base documentation for this project based on my current stack."*

---

## 📖 Workflow Documentation

Complete guide for using HarnessKit in a structured, data-driven sequence. This serves as your entry point for understanding and executing the framework.

* **[Workflow Index](docs/workflow/README.md)** — Main navigation index for the minimized documentation layout.

* **[Conceptual & Architectural Foundation](docs/workflow/META-HARNESS.md)** — Combines the system's 3-layer architecture (Developer, Skills, Filesystem $\mathcal{D}$) and the continuous optimization loop. Built on the principles of the research paper [Meta-Harness: End-to-End Optimization of Model Harnesses](https://arxiv.org/abs/2603.28052).

* **[Daily Use Playbook](docs/workflow/PLAYBOOK-DAILY-USE.md)** — Step-by-step tactical guide for daily tasks. Follow operational checklists, timelines, and command flows with confidence.

---

## Philosophy

- **Harness Engineering** — Reliability comes from controls, not just capability. An agent without a harness is unpredictable.
- **Test-Driven Development** — Write tests first. Always. No exceptions.
- **Domain-Driven Design** — Model the problem before solving it.
- **Socratic over Prescriptive** — The Grumpy Tech Lead asks questions that force the engineer to think, rather than providing ready-made answers.
- **Computational + Inferential** — Tests validate correctness. Reviews validate judgment.

---

## Integration with Superpowers

HarnessKit is designed to complement [Superpowers Skills](https://github.com/obra/superpowers). While HarnessKit defines the *strategy and discipline* (what to build and how to validate it), Superpowers provides the low-level *execution tools* (Git worktrees, parallel agents, etc.).

---

## Contributing

1. Fork the repository: `https://github.com/romabeckman/harness-kit`
2. Create a branch for your changes
3. Follow the skill conventions in `skills/*/SKILL.md`
4. Submit a PR with a clear description of what changed and why

---

## License

MIT License — see [LICENSE](LICENSE) file for details.

## Issues & Feedback

- **Issues:** https://github.com/romabeckman/harness-kit/issues
- **Author:** [Romario Beckman](https://github.com/romabeckman)

## References
- Lee, Y., Nair, R., Zhang, Q., Khattab, O., Finn, C., & Lee, K. (2026). *Meta-Harness: End-to-End Optimization of Model Harnesses*. Available at [arXiv:2603.28052](https://arxiv.org/abs/2603.28052).