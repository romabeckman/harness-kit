# 📖 HarnessKit: Workflow Documentation

User guide for HarnessKit skills and specialist agents.

The source of truth for exact behavior is each file under `skills/*/SKILL.md` and `agents/*.md`.

> [!TIP]
> Developers can invoke `tdd-orchestrator` directly for clear, bounded work, using project memory for implementation guidance. For complex scenarios, optionally refine business scope with `pbb-design`, then technical scope with `scope-refinement`. This direct path does not remove specification requirements inside the autonomous backlog loop.

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
| `project-memory` | Create, update, or consolidate evidence-backed project documentation | Canonical ADRs/features, navigation, digest, and routing graph; targeted root README edits |
| `memory-context` | Retrieve organizational knowledge, cross-project relationships, or environment differences through Harness Memory MCP | Evidence-backed context and `.harness-kit/memory.toml` discovery cache |
| `pbb-design` | Optionally refine business intent before technical design | Problems, expectations, personas, functionalities, and traceable PBIs |
| `scope-refinement` | Optionally refine complex scope into DDD design and executable scenarios; required in the autonomous planning phase | `docs/specs/{domain}/001-*` through `004-*` |
| `tdd-orchestrator` | Implement a clear interactive requirement or pre-specified autonomous scenarios through RED, GREEN, and REFACTOR | Code, tests, validation evidence, and autonomous `TDD-OUTPUT.json` |

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
| `qa-orchestrator` | Execute acceptance scenarios against a running application's supported interfaces | Runtime verdicts, evidence, reports, and coverage gaps through `hrns qa` |

Runtime acceptance QA requires runner readiness, a command preview, and explicit execution confirmation under that skill's contract. Technical review, adversarial review, and runtime acceptance provide different evidence; none replaces the others automatically.

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
| `cto` | Route business discovery through PBB, then autonomous delivery when requested | Perform tactical implementation or start delivery for analysis-only requests |

## Core artifact boundaries

- `project-memory` owns durable project documents and their derived indexes. Its Dream-inspired consolidation reconciles selected evidence and curates the digest during an invocation; it does not retrain models or schedule background work. It must not touch `docs/harness-history/` or manage `docs/specs/` and `docs/workflow/`.
- `memory-context` uses `.harness-kit/memory.toml` as discovery hints, not authority for current facts. Confirm project identities and current snapshots through the live MCP before relying on cached state.
- `pbb-design` defines business scope without designing architecture. Pass validated decisions, provisional assumptions, and open questions explicitly into technical refinement.
- `scope-refinement` owns specification documents created during its four DDD phases.
- `autonomous-orchestrator` owns product state and delegates technical work.
- `harness-tracer`, `harness-evaluator`, and `meta-harness` own harness history.
- Human approval is required before a meta-harness candidate replaces an active skill.

Project-memory consolidation maintains project knowledge. Meta-harness evaluates and proposes changes to skill instructions using session traces. Keep these responsibilities and evidence stores separate.

## Readiness checklist

- [ ] Identify whether the task needs documentation, design, implementation, validation, or optimization.
- [ ] Select the narrowest matching skill and agent.
- [ ] Provide exact project paths, domain, acceptance criteria, and constraints.
- [ ] Preserve repository rules; skill instructions do not override user or repository policy.
- [ ] Require executed test evidence before accepting implementation work.
