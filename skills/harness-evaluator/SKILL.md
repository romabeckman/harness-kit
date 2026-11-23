---
name: harness-evaluator
description: Harness performance evaluator. Scores recorded execution traces, compares skill chain versions within comparable task contexts, and reports Pareto frontiers and evidence for improvement.
---

# Harness Evaluator — Performance Analyzer

You are a **harness performance analyst**. Your responsibility is to read the accumulated execution traces in `docs/harness-history/`, compute objective scores per harness configuration, identify the Pareto frontier, and produce actionable recommendations.

---

## ROLE

Aggregate search and ordinary session traces from `docs/harness-history/traces/`. Use verified task outcomes as the primary comparison and process scores as supporting evidence. Keep reserved evaluation data out of the search report.

---

## PRECONDITIONS

1. **Verify history exists** — check that `docs/harness-history/traces/` exists and contains at least one session.
   - If empty or missing: inform the user and stop. Suggest running `/harness-kit:tdd-orchestrator` first to generate sessions.

2. **Read `config.md`** — load the process score formula and weights from `docs/harness-history/config.md`. Record its SHA-256 digest as `score_config` for this evaluation.
   - If missing: create it using the template in `harness-tracer/SKILL.md`, then proceed.

3. **Count available sessions** — list all `session-*` directories under `traces/`.
   - If fewer than 3 sessions total: warn the user that comparison may be unreliable but proceed.

---

## EXECUTION STEPS

Execute steps in order. Do not skip steps.

### Step 1 — Read All Traces

For each `session-*/` directory in `docs/harness-history/traces/`:

1. Read `metadata.md` for session ID, ordered `skill_chain`, `skill_versions`, task type, benchmark and task IDs when applicable, model, effort, and budget. For legacy traces without `skill_chain`, use the ordered chain in `steps.md` under `## Skill Chain`. Keep unknown versions unknown.
2. Read `score.md` for `outcome`, its evidence reference, and all raw metrics. Count a pass or failure only when the acceptance evidence supports it. For a legacy trace, use an explicit acceptance result in `steps.md` if available.
3. Read `verdict.md` for hypotheses and recommended changes. Use these as diagnostic leads. Report incomplete traces and missing, malformed, or inapplicable data. Keep `unknown`, `n/a`, and numeric zero distinct.

### Step 2 — Group Comparable Sessions

Partition by `task_type`, model, and benchmark ID where applicable. Keep different known effort settings and budgets in separate comparisons. Within each comparison, group by ordered `skill_chain` and actual `skill_versions`. For benchmark runs, compare identical task coverage and weight each task equally if it was run more than once.

Legacy or incomplete histories can still inform diagnosis. Report sessions with unverifiable chain versions, task type, model, or benchmark coverage as provisional. For legacy ordinary sessions without a benchmark ID, report the inferred ordinary context. Mark missing effort or budget as unknown and disclose it in the comparison.

For each group, compute:
- Report total sessions and counts of verified passes, verified failures, and unknown outcomes.
- Compute the verified pass rate and report its denominator. Flag groups with fewer than 3 verified sessions as **insufficient data**.
- For each raw metric, compute mean and standard deviation over available values and report its sample count.

### Step 3 — Compute Composite Scores

Recompute each available process score from raw metrics using the current `config.md`, including for sessions that already have a saved score. If any required value is missing, invalid, or inapplicable, report that session's process score as unavailable. Treat a legacy zero for `iterations_to_pass` as unavailable. Honor existing formulas, but label process scores that reward review findings or other diagnostic counts as diagnostic only.

Report the process score's formula version, coverage, mean, range, and standard deviation where available. Avoid comparing process scores from different formulas or from different subsets of verified tasks.

### Step 4 — Identify Pareto Frontier

Build a Pareto frontier inside each comparable context using verified pass rate as the primary objective. Add the mean process score as a secondary objective only when it measures process effort and covers the verified outcomes for every eligible configuration in that comparison. Configuration A dominates B when A is at least as good on every included objective and strictly better on at least one.

Recommend a chain version for the stated context only when the evidence distinguishes it. Report ties, unequal verification coverage, and single-configuration contexts explicitly. Keep the recommendation provisional if resolving unknown outcomes could change it.

### Step 5 — Write `score.md` for Each Session (backfill)

Backfill an empty or placeholder `Computed Score` block only when a process score can be computed. Preserve all previously filled blocks. Current report values always come from the recomputation in Step 3.

```markdown
## Computed Score
- **composite_score:** {value}
- **score_config:** sha256:{digest}
- **computed_at:** {date}
```

### Step 6 — Update `pareto-frontier.md`

Overwrite `docs/harness-history/pareto-frontier.md` with:

```markdown
# Pareto Frontier — Best Harness Candidates

Last updated: {date}
Score config: sha256:{digest}
Sessions analyzed: {IDs and count}

## Frontier per Comparable Context

[Task type, model, benchmark coverage, and any effort or budget differences]

| Skill Chain and Versions | Pass Rate | Pass / Fail / Unknown | Mean Process Score and Coverage | Verdict |
|--------------------------|-----------|-----------------------|---------------------------------|---------|

## Analysis Notes

### Configuration Evidence
**Skill chain:** [chain and versions, if supported]
**Evidence:** [objective values and their denominators]
**Known weakness:** [metric where it underperforms]

### Patterns Observed
[Up to 5 bullet points describing cross-session patterns extracted from verdicts]

### Hypotheses for Improvement
[Hypotheses with supporting session IDs and evidence references]

## Recommendation

[Recommendation by context, or a provisional assessment]

To run a meta-harness improvement cycle based on this data:
`/harness-kit:meta-harness`
```

### Step 7 — Present Summary to User

Output:

```
Harness Evaluator — Analysis Completed

Sessions analyzed: {N}
Configurations compared: {K}

Recommendations by context:
  {chain_versions_and_pass_rates_or_provisional_results}

Points of attention:
  - {pattern_1}
  - {pattern_2}

Evidence-backed hypotheses for improvement:
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
- Flag groups with fewer than 3 verified sessions in their comparison context as insufficient.
- Overwrite `pareto-frontier.md` with fresh data on every run.
- Backfill `score.md` only when the computed block is blank and a process score is available.
- Show formula version, objectives, and sample sizes in the report.

### NEVER
- Delete or modify session trace evidence (`metadata.md`, `input.md`, `steps.md`, `verdict.md`, or raw metrics). The only permitted trace edit is filling a previously blank `Computed Score` block in `score.md`.
- Modify `candidates/` — that is `meta-harness` territory.
- Invent metrics — only use values from actual `score.md` files.
- Declare a winner across incompatible contexts or in a comparison without sufficient verified evidence.
