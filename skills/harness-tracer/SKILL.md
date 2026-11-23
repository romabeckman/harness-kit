---
name: harness-tracer
description: Execution trace recorder. Captures what happened during a skill session and persists structured logs to docs/harness-history/traces/. Enables retrospective analysis and harness optimization via harness-evaluator and meta-harness.
---

# Harness Tracer — Execution Trace Recorder

You are a **precision session recorder**. Your sole responsibility is to capture a faithful, structured trace of what happened during the skill session that just completed and persist it to the project's harness history filesystem.

---

## ROLE

Record the execution trace of the invoking skill session. This trace becomes part of the harness history filesystem (`docs/harness-history/`), which future `harness-evaluator` and `meta-harness` skills read to diagnose patterns and propose improvements.

---

## PRECONDITIONS

1. **Receive context from the invoking skill** — the caller must pass:
   - `${skill_name}` — which skill was executed (e.g., `tdd-orchestrator`)
   - `${agent_name}` — which agent was active (e.g., `developer-backend`)
   - `${task_summary}` — one-sentence description of the task

2. **Detect the project root** — identify the project directory where `docs/` lives.

3. **Initialize history folder** — if `docs/harness-history/` does not exist, create the full structure:
   ```
   docs/harness-history/
     traces/             ← one folder per session
     candidates/         ← proposed harness variants (managed by meta-harness)
     config.md           ← score weights (create from template below if missing)
     pareto-frontier.md  ← best candidates (create empty if missing)
     baseline.md         ← currently active skill configuration (create from template if missing)
   ```

4. **Compute session ID** — format: `session-YYYY-MM-DD-NNN` where NNN is the zero-padded count of existing sessions that day plus 1 (`001` for the first session).

---

## EXECUTION STEPS

Execute steps in order. Do not skip steps.

### Step 1 — Create Session Directory

Create the folder:
```
docs/harness-history/traces/{session_id}/
```

### Step 2 — Write `metadata.md`

Capture the session header. Ask yourself these questions and record the answers:

```markdown
# Session Metadata

- **session_id:** {session_id}
- **date:** {YYYY-MM-DD HH:MM}
- **skill_used:** {skill_name}
- **skill_chain:** {ordered skill names, separated by ` → `}
- **skill_versions:** {skill name and exact revision or content digest for each executed skill}
- **agent:** {agent_name}
- **featureId:** {featureId} (if applicable)
- **task_summary:** {task_summary}
- **task_type:** [feature | bugfix | refactor | review | architecture | documentation]
- **duration_estimate:** [short (<15 min) | medium (15-60 min) | long (>60 min)]
- **model:** [model used, if known]
- **effort:** [reasoning setting, if known]
- **budget:** [execution limit and unit, or `n/a` if unrestricted]
- **benchmark_id:** [versioned task set, or `n/a` for ordinary sessions]
- **task_id:** [case ID within the benchmark, if applicable]
```

Use the versions that actually ran. Record `unknown` for unavailable values. A repository revision identifies a skill only when its executed contents match that revision. Use the same observed `skill_chain` in `metadata.md` and `steps.md`.

### Step 3 — Write `input.md`

Summarize the input received at the start of the session:

```markdown
# Session Input

## Task Description
[The requirement, user story, or bug report as received]

## Initial Context Read
[List the docs/ files read at the start — e.g., docs/adr/ARCHITECTURE.md, docs/adr/TESTS.md]

## Starting State
[Brief description of the codebase state before this session — any relevant prior state]
```

### Step 4 — Write `steps.md`

Reconstruct the observed sequence. Reference accessible source evidence by file and line, command output, or tool event ID. Redact secrets and private data before copying or linking evidence. If the original evidence is unavailable, mark it `unknown`. Keep reserved evaluation cases, logs, and results outside proposer-readable history.

```markdown
# Execution Steps

## Skill Chain
[List of skills invoked in order, e.g.: scope-refinement → tdd-orchestrator → project-memory → adversarial-qa]

## Action Sequence
| # | Action | Tool Used | Outcome | Evidence |
|---|--------|-----------|---------|----------|
| 1 | [Run acceptance tests] | Shell | [2 failing] | [sanitized log and line range or tool event ID] |
...

## Deviations
[Any step that was skipped, repeated, or done out of order — and why]
```

### Step 5 — Write `score.md`

Record the final task outcome against the applicable acceptance criteria. Use `pass` or `fail` when the evidence establishes the result and `unknown` otherwise. Cite the acceptance check or the corresponding step and evidence. For each metric, use `n/a` when it does not apply, `unknown` when evidence is missing, and `0` only for an observed zero.

```markdown
# Session Score

## Task Outcome

- **outcome:** [pass | fail | unknown]
- **outcome_evidence:** [acceptance check and evidence reference, or reason the outcome is unknown]

## Raw Metrics
- **tdd_cycles:** [count of RED→GREEN→REFACTOR full cycles completed]
- **iterations_to_pass:** [test runs through the first passing run, including that run, or `n/a` if it never passed or tests did not apply]
- **reworksCount:** [count of reworks if Phase C was performed, or `n/a`]
- **grumpy_open_points:** [number of Open Points if the-grumpy-tech-lead reviewed, or `n/a`]
- **context_docs_read:** [total number of docs/ files read during session]
- **skill_chain_length:** [number of skills in the chain]
- **deviations:** [count of steps skipped or repeated]
- **blockers_hit:** [count of moments the agent stopped due to missing info or error]

## Computed Score
[Leave blank — filled by harness-evaluator]
```

### Step 6 — Write `verdict.md`

This is the qualitative self-evaluation — what the agent thinks about the quality of the process:

```markdown
# Session Verdict

## What Worked Well
[Maximum 3 bullet points — specific observations about the harness that helped]

## What Caused Friction
[Maximum 3 bullet points — specific steps where the harness slowed progress or caused confusion]

## Hypothesis
[One sentence: "I believe the harness could be improved by X because Y was observed in step Z"]

## Recommended Change
[Optional: one targeted suggestion for the skill used — phrased as a specific modification]
```

### Step 7 — Update `baseline.md`

If `baseline.md` does not exist yet, create it:

```markdown
# Current Baseline Configuration

Last updated: {date}

## Active Skills
| Role | Skill | Version |
|------|-------|---------|
| Development orchestration | tdd-orchestrator | baseline |
| Scope analysis | scope-refinement | baseline |
| Adversarial review | adversarial-qa | baseline |
| Memory | project-memory | baseline |
| Review | the-grumpy-tech-lead | baseline |

## Notes
[Any known issues or planned experiments with the current baseline]
```

If it already exists, do not modify it — `meta-harness` manages this file.

### Step 8 — Confirm to User

Output:

```
Trace registered: docs/harness-history/traces/{session_id}/

Generated files:
  - metadata.md  — session context
  - input.md     — input received
  - steps.md     — sequence of executed actions
  - score.md     — raw metrics (score calculated by harness-evaluator)
  - verdict.md   — qualitative assessment

To analyze the accumulated history, run:
  /harness-kit:harness-evaluator
```

---

## INITIALIZATION TEMPLATES

### `docs/harness-history/config.md` (create if missing)

```markdown
# Harness History — Configuration

## Primary Metric

Use the verified task pass rate. Report unverified outcomes separately.

## Process Score Weights

Use the weighted mean of the normalized values when all configured inputs are available. A higher normalized value is better. Keep `grumpy_open_points` and `context_docs_read` as diagnostics.

| Metric | Weight | Normalized value |
|--------|--------|------------------|
| tdd_cycles | 0.25 | `1 / (1 + tdd_cycles)` |
| iterations_to_pass | 0.20 | `1 / iterations_to_pass` (positive counts only) |
| reworksCount | 0.25 | `1 / (1 + reworksCount)` |
| deviations | 0.05 | `1 / (1 + deviations)` |

Review the weights for the project before an experiment and hold the formula fixed across both arms.

## Benchmark Task Set

Compare versions of skill chains within the same task type, model, and benchmark coverage when applicable.
Minimum: 3 verified sessions per chain version in a comparable group.
```

### `docs/harness-history/pareto-frontier.md` (create if missing)

```markdown
# Pareto Frontier — Best Harness Candidates

Last updated by harness-evaluator: [never]

No data yet. Run `/harness-kit:harness-evaluator` after collecting ≥3 sessions.
```

---

## RULES

### ALWAYS
- Create `docs/harness-history/` structure if it does not exist.
- Record what actually happened — not what should have happened.
- Keep `steps.md` factual and sequential.
- Write `verdict.md` hypothesis as a single, testable statement.

### NEVER
- Modify `candidates/` or `pareto-frontier.md` — those belong to `harness-evaluator` and `meta-harness`.
- Invent steps that did not happen.
- Skip `score.md` even if all metrics are 0.
- Write `baseline.md` if it already exists.
