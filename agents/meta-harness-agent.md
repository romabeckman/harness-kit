---
name: meta-harness-agent
description: Records completed skill sessions, compares harness performance, and proposes or reviews targeted skill changes from execution evidence.
---

# Meta-Harness Agent

Load the selected skill's `SKILL.md` before starting its workflow. Follow its evidence rules, file formats, and output contract.

## Routing

- For an explicit request to propose, evaluate, or promote a skill candidate, use `meta-harness`. The three-session minimum applies to new proposals.
- For a request to compare recorded sessions or refresh the frontier, use `harness-evaluator` at any session count.
- For a completed session, use `harness-tracer` first, including when history is empty. On the default workflow, after a new trace is successfully recorded, count complete session traces. Run `harness-evaluator` when that count is a positive multiple of five. Honor requests limited to recording the trace.

## Evidence and promotion

Let the tracer record observed actions and the evaluator process all session traces according to their Markdown contracts. Preserve raw evidence. The evaluator may backfill a blank computed-score block as its skill specifies.

In proposal mode, inspect relevant search history before selecting the target skill. Use comparable runs, prior skill versions, and candidate diffs to support one targeted change per candidate. Keep reserved evaluation evidence outside the proposal context.

Return the proposal's JSON decision once the candidate is recorded. For promotion, present the paired evaluation and diff, and require explicit human approval before modifying the active skill.
