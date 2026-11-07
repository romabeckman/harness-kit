# 🏗️ Architectural and Flow Guide: Harness Optimization with HarnessKit

The meta-harness loop improves skill instructions from recorded execution evidence. Three skills own the evidence lifecycle; `meta-harness-agent` routes between them.

## Components

| Skill | Responsibility | Output |
| --- | --- | --- |
| `harness-tracer` | Record one completed session factually | `docs/harness-history/traces/session-*/` |
| `harness-evaluator` | Score traces and compare skill chains | `docs/harness-history/pareto-frontier.md` |
| `meta-harness` | Propose one targeted skill change | `docs/harness-history/candidates/vNNN/` |

`meta-harness-agent` coordinates these skills. It does not implement product features.

## Agent routing

The agent applies this order:

1. Explicit request for candidate search, evaluation, or promotion: run `meta-harness`.
2. Otherwise, when trace count is a positive multiple of `5`: run `harness-evaluator`.
3. Otherwise: run `harness-tracer`.

Explicit meta-harness work has priority over trace-count routing.

These rules apply when the agent is invoked; trace count does not schedule background execution. To request only a fresh history comparison, invoke `harness-evaluator` directly. A request to evaluate an already tested candidate belongs to `meta-harness` with that candidate's evaluation context.

## Evidence flow

```mermaid
flowchart LR
    A[Completed skill session] --> B[harness-tracer]
    B --> C[Preserved raw trace evidence]
    C --> D[harness-evaluator]
    D --> E[Pareto frontier]
    C --> F[meta-harness]
    E --> F
    F --> G[Candidate vNNN]
    G -->|Explicit human approval| H[Active skill]
```

## Record a trace

Invoke through the optimizer agent or directly:

```text
/harness-kit:harness-tracer
```

Provide:

- Skill name.
- Agent name.
- One-sentence task summary.
- Actual inputs, context reads, steps, deviations, and outcomes from the completed session.

Each trace contains `metadata.md`, `input.md`, `steps.md`, `score.md`, and `verdict.md`. Record what happened, not what should have happened.

On first use, the tracer initializes the history structure, score-weight configuration, baseline, and empty frontier from its templates. A completed development session is not automatically a recorded trace: invoke the tracer with the actual session context. Do not invent missing measurements or reconstruct an expected execution as observed evidence.

## Evaluate history

```text
/harness-kit:harness-evaluator
```

The evaluator:

- Reads every trace.
- Groups sessions by skill chain.
- Applies weights from `docs/harness-history/config.md`.
- Backfills only blank computed-score blocks in trace `score.md` files.
- Updates `pareto-frontier.md`.
- Treats groups below `3` sessions as insufficient evidence.

The evaluator may run with fewer than `3` total sessions, but its comparison is provisional. It must not declare a reliable winner from an undersized group.

At least one recorded session is required. Missing score-weight configuration is initialized from the tracer's template. Existing raw metrics and filled score blocks remain preserved; the evaluator's explicit exception is backfilling blank computed-score blocks.

## Propose an improvement

```text
/harness-kit:meta-harness
```

Preconditions:

- At least `3` traces exist.
- `pareto-frontier.md` is current.

The proposer reads the frontier, compares the bottom `3` sessions with the top `2`, identifies one divergence, and creates one targeted candidate. A candidate directory contains:

```text
docs/harness-history/candidates/v001/
├── rationale.md
├── diff.md
├── score.md
└── SKILL.md
```

Candidate creation does not modify the active skill.

The initial candidate score is pending (`evaluated: false`, `promoted: false`). The proposer returns `PROPOSED` with `EVALUATE_CANDIDATE`; this requests evaluation rather than proving that any comparison has run. The skill does not define a self-contained candidate execution runner. Arrange a comparable evaluation and persist its results before invoking promotion mode.

## Promotion rule

Require explicit human approval before copying candidate instructions into `skills/{skill}/SKILL.md`. Present the score comparison and diff first.

If candidate score does not beat baseline, keep the active skill unchanged and return a revert decision.

An improvement without approval returns `PROPOSED` / `AWAIT_APPROVAL`. Approved promotion returns `PROMOTED` / `OPTIMIZED`; a score at or below baseline returns `PROPOSED` / `REVERT`. Here, `REVERT` is a decision to leave the active skill unchanged, not permission to discard unrelated workspace edits.

## Interpretation cautions

- Composite score measures configured process metrics, not product correctness alone.
- Compare similar task types and identical skill chains.
- Keep one change per candidate so results remain attributable.
- Preserve raw traces as append-only evidence.
- Never change score weights during the same experiment as a skill change.
- Reject hypotheses that do not cite specific trace evidence.

## Distinguish optimization from Dream

Dream-inspired consolidation in `project-memory` maintains evidence-backed project knowledge and curates its digest. Meta-harness changes the instructions used to perform work, using session traces and candidate evaluation. Neither process proves improved model accuracy from document structure alone. Do not use `project-memory` to inspect harness history, and do not treat repeated generated claims as independent experimental evidence.
