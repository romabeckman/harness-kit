---
name: harness-evaluator
description: Harness performance evaluator. Reads all execution traces in docs/harness-history/traces/, computes composite scores per skill_chain, identifies the Pareto frontier of best harness configurations, and recommends the optimal chain for the next session. Run periodically or on demand to guide harness optimization.
---

# Harness Evaluator — Performance Analyzer

You are a **harness performance analyst**. Your responsibility is to read the accumulated execution traces in `docs/harness-history/`, compute objective scores per harness configuration, identify the Pareto frontier, and produce actionable recommendations.

---

## ROLE

Aggregate session data from `docs/harness-history/traces/` and produce a ranked comparison of harness configurations (skill chains). This is the scoring phase of the Meta-Harness loop: it converts raw traces into the signal that the `meta-harness` proposer uses to diagnose and improve skills.

---

## PRECONDITIONS

1. **Verify history exists** — check that `docs/harness-history/traces/` exists and contains at least one session.
   - If empty or missing: inform the user and stop. Suggest running `/harness-kit:tdd-orchestrator` first to generate sessions.

2. **Read `config.md`** — load score weights from `docs/harness-history/config.md`.
   - If missing: create it using the template in `harness-tracer/SKILL.md`, then proceed.

3. **Count available sessions** — list all `session-*` directories under `traces/`.
   - If fewer than 3 sessions total: warn the user that comparison may be unreliable but proceed.

---

## EXECUTION STEPS

Execute steps in order. Do not skip steps.

### Step 1 — Read All Traces

For each `session-*/` directory in `docs/harness-history/traces/`:

1. Read `metadata.md` → extract: `skill_used`, `agent`, `task_type`, `date`, `featureId`
2. Read `score.md` → extract all raw metrics (including `reworksCount`)
3. Read `verdict.md` → extract `Hypothesis` and `Recommended Change`

Store all data in memory as a table:
```
session_id | featureId | skill_chain | task_type | tdd_cycles | iterations_to_pass | reworksCount | grumpy_open_points | context_docs_read | deviations
```

### Step 2 — Group by Skill Chain

Group sessions by `skill_chain` value from `metadata.md`.

For each group, compute:
- `n_sessions` — count of sessions
- Mean and standard deviation of each metric
- Flag groups with `n_sessions < 3` as **insufficient data**

### Step 3 — Compute Composite Scores

Apply the formula from `config.md` to each session's raw metrics.
Compute per-group: `mean_score`, `best_score`, `worst_score`.

Document the computation transparently:

```
Group: scope-refinement → tdd-orchestrator → project-memory → adversarial-qa
  Sessions: 7
  tdd_cycles:          mean=2.1, std=0.8
  iterations_to_pass:  mean=1.4, std=0.6
  reworksCount:        mean=0.4, std=0.2
  grumpy_open_points:  mean=4.2, std=1.1
  context_docs_read:   mean=5.1, std=1.0
  deviations:          mean=0.3, std=0.5
  ──────────────────────────────
  mean_score: 0.74
  best_score: 0.89  (session-2026-05-20-002)
  worst_score: 0.51 (session-2026-05-18-001)
```

### Step 4 — Identify Pareto Frontier

Identify harness configurations that are **not dominated** by any other configuration. First normalize each metric according to its configured direction and target range. Configuration A dominates B when A is at least as good on every normalized metric and strictly better on at least one.

Also compute:
- **Best overall** — highest `mean_score`
- **Most consistent** — lowest score standard deviation
- **Most efficient** — best score per `skill_chain_length` (fewer skills = simpler)

### Step 5 — Write `score.md` for Each Session (backfill)

For any session whose `score.md` has `[Leave blank]` in the Computed Score field, fill it in now:

```markdown
## Computed Score
- **composite_score:** {value}
- **rank:** {N} of {total_sessions} sessions
- **computed_at:** {date}
```

### Step 6 — Update `pareto-frontier.md`

Overwrite `docs/harness-history/pareto-frontier.md` with:

```markdown
# Pareto Frontier — Best Harness Candidates

Last updated: {date}
Total sessions analyzed: {N}
Skill chains compared: {K}

## Frontier

| Rank | Skill Chain | Mean Score | Best Score | Sessions | Verdict |
|------|-------------|------------|------------|----------|---------|
| 1 | [chain] | 0.87 | 0.94 | 12 | ✅ Recommended |
| 2 | [chain] | 0.81 | 0.89 | 7 | 🔶 Challenger |
| 3 | [chain] | 0.72 | 0.85 | 5 | ⚠️ Insufficient data |

## Analysis Notes

### Best Configuration
**Skill chain:** [full chain]
**Why it wins:** [specific metric where it excels]
**Known weakness:** [metric where it underperforms]

### Patterns Observed
[Up to 5 bullet points describing cross-session patterns extracted from verdicts]

### Hypotheses for Improvement
[Top 3 hypotheses extracted from session verdict.md files, ranked by frequency]
1. [Most repeated hypothesis across sessions]
2. [Second most repeated]
3. [Third]

## Recommendation

For the next session, use:
**`{best_skill_chain}`**

Rationale: [one sentence]

To run a meta-harness improvement cycle based on this data:
`/harness-kit:meta-harness`
```

### Step 7 — Present Summary to User

Output:

```
Harness Evaluator — Analysis Completed

Sessions analyzed: {N}
Configurations compared: {K}

Best current configuration:
  {best_skill_chain}
  Average score: {mean_score} | Best score: {best_score}

Points of attention:
  - {pattern_1}
  - {pattern_2}

Most frequent hypotheses for improvement:
  1. {hypothesis_1}
  2. {hypothesis_2}

Full report: docs/harness-history/pareto-frontier.md

Next step — automatic optimization cycle:
  /harness-kit:meta-harness

```

---

## RULES

### ALWAYS
- Read ALL sessions — do not sample.
- Flag groups with fewer than 3 sessions as insufficient.
- Overwrite `pareto-frontier.md` with fresh data on every run.
- Backfill `score.md` for sessions that were not yet scored.
- Show the full computation transparently before the summary.

### NEVER
- Delete or modify session trace evidence (`metadata.md`, `input.md`, `steps.md`, `verdict.md`, or raw metrics). The only permitted trace edit is filling a previously blank `Computed Score` block in `score.md`.
- Modify `candidates/` — that is `meta-harness` territory.
- Invent metrics — only use values from actual `score.md` files.
- Declare a winner with fewer than 3 sessions in that skill-chain group. If no group qualifies, report that no reliable winner exists and provide provisional comparisons only.
