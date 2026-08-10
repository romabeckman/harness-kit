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
- **agent:** {agent_name}
- **featureId:** {featureId} (if applicable)
- **task_summary:** {task_summary}
- **task_type:** [feature | bugfix | refactor | review | architecture | documentation]
- **duration_estimate:** [short (<15 min) | medium (15-60 min) | long (>60 min)]
- **model:** [model used, if known]
```

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

Reconstruct the sequence of actions taken during the session. Be factual — record what happened, not what should have happened:

```markdown
# Execution Steps

## Skill Chain
[List of skills invoked in order, e.g.: scope-refinement → tdd-orchestrator → project-memory → adversarial-qa]

## Action Sequence
| # | Action | Tool Used | Outcome |
|---|--------|-----------|---------|
| 1 | [Read docs/adr/ARCHITECTURE.md] | Read | [success / not found] |
| 2 | [Write failing test for X] | Write | [success] |
| 3 | [Run tests] | Bash | [2 failing] |
| 4 | [Implement X] | Edit | [success] |
| 5 | [Run tests] | Bash | [all passing] |
...

## Deviations
[Any step that was skipped, repeated, or done out of order — and why]
```

### Step 5 — Write `score.md`

Calculate objective metrics by inspecting the action sequence:

```markdown
# Session Score

## Raw Metrics
- **tdd_cycles:** [count of RED→GREEN→REFACTOR full cycles completed]
- **iterations_to_pass:** [how many test runs before all tests passed — 1 if first run passed]
- **reworksCount:** [count of reworks during Phase C validation, or 0]
- **grumpy_open_points:** [number of Open Points raised by the-grumpy-tech-lead, or 0 if not invoked]
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

## Score Weights
These weights are used by harness-evaluator to compute the composite score.
Adjust based on what matters most for your project.

| Metric | Weight | Direction | Description |
|--------|--------|-----------|-------------|
| tdd_cycles | 0.25 | lower is better | Fewer cycles = harness guides more precisely |
| iterations_to_pass | 0.20 | lower is better | Fewer runs = faster convergence |
| reworksCount | 0.25 | lower is better | Fewer reworks = validation passed faster |
| grumpy_open_points | 0.20 | higher is better | More points = deeper architectural review |
| context_docs_read | 0.05 | moderate is better | Too low = missing context; too high = noise |
| deviations | 0.05 | lower is better | Fewer deviations = harness is clearer |

## Composite Score Formula
score = (1 / max(tdd_cycles, 1)) × 0.25
      + (1 / max(iterations_to_pass, 1)) × 0.20
      + (1 / max(reworksCount + 1, 1)) × 0.25
      + (grumpy_open_points / 10) × 0.20
      + (1 / (deviations + 1)) × 0.05
      + context_score × 0.05

context_score = 1.0 if 3 ≤ context_docs_read ≤ 8
              = 0.5 if context_docs_read < 3 or 9 ≤ context_docs_read ≤ 12
              = 0.0 if context_docs_read > 12

## Benchmark Task Set
Skill chains will be compared across sessions with the same task_type.
Minimum sessions before reliable comparison: 3 per skill_chain.
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
