# HarnessKit: Daily Use Playbook

Practical routing guide for project skills and agents. Invoke only the smallest workflow that covers the task.

## Before starting

- Identify project path, domain, desired outcome, acceptance criteria, and constraints.
- Read existing project memory when present: `docs/.digest.md`, then `docs/.graph.json` for targeted routing.
- Preserve user and repository rules. Skills do not override them.
- Choose an agent whose ownership matches the work.
- Require executed evidence before accepting completion.

## Decision guide

| Need | Skill | Primary agent |
| --- | --- | --- |
| Initialize or update durable docs | `project-memory` | `software-architect` |
| Refine a feature or domain | `scope-refinement` | `software-architect` |
| Convert a prototype into UI structure | `read-ui-prototype` | specification targets `developer-frontend` |
| Implement backend work | `tdd-orchestrator` | `developer-backend` |
| Implement frontend work | `tdd-orchestrator` | `developer-frontend` |
| Implement test-focused work | `tdd-orchestrator` | `developer-qa` |
| Implement CI/CD or infrastructure work | `tdd-orchestrator` | `developer-devops` |
| Diagnose an unknown failure | investigation workflow | `developer-debugging` |
| Review systemic technical risk | `the-grumpy-tech-lead` | `harness-tech-lead` |
| Probe edge cases and security | `adversarial-qa` | `harness-qa` |
| Run the complete backlog loop | `autonomous-orchestrator` | orchestrator delegates specialists |
| Record a run | `harness-tracer` | `meta-harness-agent` |
| Compare harness runs | `harness-evaluator` | `meta-harness-agent` |
| Propose a skill improvement | `meta-harness` | `meta-harness-agent` |

## Flow 1: initialize project memory

```text
/harness-kit:project-memory
```

Use for a new repository or a targeted documentation update. Expected baseline:

- `docs/README.md`
- `docs/adr/ARCHITECTURE.md`
- `docs/adr/TESTS.md`
- `docs/.digest.md`
- `docs/.graph.json`

Only `ARCHITECTURE.md` and `TESTS.md` are mandatory ADRs. Create other ADRs only by explicit human decision or required decomposition.

`project-memory` may create or update `docs/adr/` and `docs/feature/`. It must not read or modify `docs/harness-history/`.

## Flow 2: refine scope

```text
/harness-kit:scope-refinement
```

Provide project paths, domain, scope, business rules, and known constraints.

Interactive mode performs its clarification gate. Autonomous mode receives variables from the orchestrator and does not pause.

Expected documents:

```text
docs/specs/{domain}/
├── 001-problem-space.md
├── 002-context-map.md
├── 003-*-tactical-design.md
└── 004-*-test-scenarios.md
```

LOW-complexity planning may use the documented fast path and produce only tactical design plus test scenarios. Do not assume `001` and `002` always exist.

## Flow 3: implement with TDD

```text
/harness-kit:tdd-orchestrator
```

Provide domain, project paths, selected tasks, tactical design, and test scenarios.

Execution contract:

1. RED: write tests from approved scenarios and prove they fail for the expected reason.
2. GREEN: implement the smallest code that passes.
3. REFACTOR: improve structure while keeping tests green.
4. Validate: run required targeted and regression checks.
5. Document: in interactive mode, invoke `project-memory` when project behavior or structure changed.

If tests fail unexpectedly, route diagnosis to `developer-debugging`. That agent proves root cause and hands off; it does not implement the final fix.

Autonomous mode writes `docs/specs/{domain}/TDD-OUTPUT.json`. It does not emit interactive progress blocks.

## Flow 4: review

Technical review:

```text
/harness-kit:the-grumpy-tech-lead
```

Use for concrete systemic risks: security, scalability, concurrency, data consistency, performance, maintainability, and architecture.

Adversarial validation:

```text
/harness-kit:adversarial-qa
```

Use against machine-readable specifications and implemented code. It tests boundaries, error handling, abuse cases, and demonstrated security weaknesses.

Both autonomous reviewers return scores in `[0.00, 1.00]`. Default threshold is `0.70`. HIGH/CRITICAL vulnerabilities fail adversarial validation regardless of score.

Review agents report findings. Route fixes back through the responsible developer agent and TDD workflow.

## Flow 5: autonomous backlog

```text
/harness-kit:autonomous-orchestrator
```

Use when scope and project paths are sufficiently complete for uninterrupted delegation.

The orchestrator asks `resume` or `reset` at its initial gate. A reset collects scope. Then it owns state transitions and delegates planning, implementation, review, and memory.

Before starting:

- Confirm reset will not discard product state you need.
- Ensure backlog dependencies can be inferred from scope.
- State repository restrictions explicitly.
- Ensure any deployment action is authorized. The orchestrator must skip forbidden staging, commit, push, or deployment actions.

See [AUTONOMOUS-ORCHESTRATOR.md](AUTONOMOUS-ORCHESTRATOR.md).

## Flow 6: optimize the harness

Record a completed session:

```text
/harness-kit:harness-tracer
```

At positive multiples of `5` traces, `meta-harness-agent` routes to `harness-evaluator` unless an explicit meta-harness request takes priority.

Manual evaluation:

```text
/harness-kit:harness-evaluator
```

Candidate proposal after at least `3` traces and a current frontier:

```text
/harness-kit:meta-harness
```

Never promote a candidate without explicit human approval. See [META-HARNESS.md](META-HARNESS.md).

## Common mistakes

| Mistake | Correct action |
| --- | --- |
| Starting implementation from an ambiguous request | Run `scope-refinement` first |
| Treating `developer-debugging` as a fix implementer | Use it for diagnosis; route handoff to developer or architect |
| Inventing tests beyond approved autonomous scenarios | Update scope/specs first, then run TDD |
| Claiming success without test output | Run the applicable test suite and report evidence |
| Asking review agents to implement their findings | Route findings to responsible developer agent |
| Letting `project-memory` touch harness history | Use tracer, evaluator, or meta-harness agent |
| Assuming fifth trace always creates a candidate | Fifth trace routes evaluation; candidate search requires explicit request |
| Applying a candidate immediately | Compare evidence and request human approval |

## Completion checklist

- [ ] Output matches approved scope and acceptance criteria.
- [ ] RED, GREEN, and REFACTOR evidence exists for implementation work.
- [ ] Relevant regression checks pass.
- [ ] Review findings are resolved or explicitly recorded.
- [ ] Durable project memory reflects changed behavior or architecture.
- [ ] Harness trace records facts only when optimization evidence is desired.
