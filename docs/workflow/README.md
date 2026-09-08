# 📖 HarnessKit: Workflow Documentation

User guide for HarnessKit skills and specialist agents.

The source of truth for exact behavior is each file under `skills/*/SKILL.md` and `agents/*.md`.

## Start here

| Goal | Guide |
| --- | --- |
| Choose and invoke skills for daily work | [PLAYBOOK-DAILY-USE.md](PLAYBOOK-DAILY-USE.md) |
| Run the sovereign skill-driven loop | [AUTONOMOUS-ORCHESTRATOR.md](AUTONOMOUS-ORCHESTRATOR.md) |
| Record and improve harness behavior | [META-HARNESS.md](META-HARNESS.md) |

## Skill groups

### Foundation

| Skill | Use when | Primary output |
| --- | --- | --- |
| `project-memory` | Create or update durable project documentation | `docs/adr/`, `docs/feature/`, `docs/.digest.md`, `docs/.graph.json` |
| `scope-refinement` | Convert a requirement into DDD design and executable scenarios | `docs/specs/{domain}/001-*` through `004-*` |
| `tdd-orchestrator` | Implement approved scenarios through RED, GREEN, and REFACTOR | Code, tests, validation evidence, and autonomous `TDD-OUTPUT.json` |

### Orchestration and UI

| Skill | Use when | Primary output |
| --- | --- | --- |
| `autonomous-orchestrator` | Drive a backlog through planning, implementation, review, memory, and authorized deployment | Product state under `docs/product/` |
| `read-ui-prototype` | Translate supplied screens or frames into a frontend implementation specification | Semantic UI specification for `developer-frontend` |

### Quality gates

| Skill | Use when | Primary output |
| --- | --- | --- |
| `the-grumpy-tech-lead` | Review systemic architecture, security, performance, and maintainability risks | Socratic review or `TL.json` |
| `adversarial-qa` | Probe boundaries, failures, and security against machine-readable specs | QA verdict or `QA.json` |

### Harness optimization

| Skill | Use when | Primary output |
| --- | --- | --- |
| `harness-tracer` | Record one completed skill session | `docs/harness-history/traces/session-*/` |
| `harness-evaluator` | Score accumulated traces and compare skill chains | `docs/harness-history/pareto-frontier.md` |
| `meta-harness` | Propose one evidence-backed skill improvement | `docs/harness-history/candidates/vNNN/` |

## Agent routing

| Agent | Responsibility | Must not do |
| --- | --- | --- |
| `software-architect` | DDD, architecture, scope refinement, planning, memory | Implement production code |
| `developer-backend` | APIs, services, persistence, backend tests | Own frontend or infrastructure work |
| `developer-frontend` | UI implementation, accessibility, client performance | Invent visual requirements absent from specs |
| `developer-qa` | Test strategy and test implementation | Implement product features |
| `developer-devops` | CI/CD, containers, infrastructure, observability | Implement business logic or deploy without rollback plan |
| `developer-debugging` | Evidence-based root-cause investigation | Implement the final fix |
| `harness-tech-lead` | Autonomous systemic review | Implement reviewed changes |
| `harness-qa` | Autonomous adversarial validation | Replace implementation agents |
| `meta-harness-agent` | Route tracing, evaluation, and skill optimization | Modify active skills without approval |
| `cto` | Govern strategy and trigger the autonomous loop | Perform tactical implementation |

## Core artifact boundaries

- `project-memory` owns durable project documents. It must not touch `docs/harness-history/`.
- `scope-refinement` owns specification documents created during its four DDD phases.
- `autonomous-orchestrator` owns product state and delegates technical work.
- `harness-tracer`, `harness-evaluator`, and `meta-harness` own harness history.
- Human approval is required before a meta-harness candidate replaces an active skill.

## Readiness checklist

- [ ] Identify whether the task needs documentation, design, implementation, validation, or optimization.
- [ ] Select the narrowest matching skill and agent.
- [ ] Provide exact project paths, domain, acceptance criteria, and constraints.
- [ ] Preserve repository rules; skill instructions do not override user or repository policy.
- [ ] Require executed test evidence before accepting implementation work.
