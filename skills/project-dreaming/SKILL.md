---
name: project-dreaming
description: Review selected development episodes between tasks to propose, evaluate, publish, or retire local guidance for the next RED. Invoke explicitly with the owning project directory and a feature or evidence locator.
---

# Project Dreaming

Run this workflow only when the operator explicitly invokes Project Dreaming. Work one project and one feature at a time. Resolve the explicitly supplied project directory before reading or writing anything. Accept a feature node/path, trace or session ID, test locator, rework entry, or hypothesis ID. If the evidence points to several owners, resolve the scope before writing. Use [contracts](references/CONTRACTS.md) throughout, and load [paired evaluation](references/PAIRED-EVALUATION.md) when preparing or reconciling an evaluation.

## 1. Select evidence

1. Route through the owning project's `docs/.graph.json` and the selected feature's top graph. Use exact paths and targeted search when routing is missing or stale. Verify the behavior owner, current requirements, linked tests, and any relevant planned work.
2. Inspect only the selected episodes and supporting evidence. Prioritize verifiable human corrections, rework with a demonstrated outcome, documentation drift, and test approaches that could help on planned work. For a trace, start with metadata and outcome, then read the cited steps and underlying evidence. A session summary is a lead until checked.
3. For a direct TDD session, accept a session ID and tool-event locator, or a project-relative test and an actual command/result with a revision or run ID. If execution cannot be checked, mark its outcome unknown and use only facts that can be verified independently.
4. If the evidence establishes only a factual correction, pass the claim, owner, and support directly to `project-memory`. Use `docs/adr/TESTS.md` only for an adopted project-wide convention. Route skill-level changes with representative episodes to `meta-harness`. If support or an actionable test decision is missing, report the gap and leave the queue unchanged.

## 2. Formulate or reconcile a hypothesis

Inspect active and archived records for the selected feature, including published rules in its document. Match the decision, condition, and exception to reuse an existing ID. Append new origins by stable locator; reprocessing the same origin is a no-op. Follow alias records to the canonical ID.

Write the smallest test decision the evidence motivates. State when it changes test selection, the exception, prediction, refutation condition, and next trigger. Preserve what was observed and what remains to be tested. Write a new record only with a verifiable origin. A material revision preserves the old frozen text and requires a new evaluation before publishing altered guidance.

## 3. Prepare or reconcile an independent evaluation

Freeze the hypothesis revision, prediction, refutation, and decision criteria before receiving results. If the evaluator has selected a distinct task set, mark the revision `in_evaluation`. Give the evaluator the frozen hypothesis and the paired-run contract. The evaluator owns reserved cases, execution and verification in a separate session. Read only the returned evidence summary and its accessible verification locators when reconciling results.

Upsert the attempt by evaluation ID. Check its frozen revision, distinct task, comparability, both arms, controls, and verifier evidence before accepting its decision. A confirmed gain yields `validated`. Archive a refuted hypothesis with the counterexample. Keep inconclusive results active only with a concrete next trigger. A corrected hypothesis gets a new revision and a fresh evaluation.

## 4. Hand off publication or withdrawal

For a validated revision, provide the [handoff](references/CONTRACTS.md#project-memory-handoff) inline to `project-memory`. Include the owner, exact procedure and evidence it can inspect within its read boundary. First check whether the same ID/revision and content already resolve by graph. After the handoff, reread the feature through the graph and verify the receipt, ID, revision, content, and references. Archive as `published` only after confirmation. A failed handoff leaves `validated` in the active queue with a publication retry trigger.

On contract drift or credible counterevidence, recheck the current requirement and reconcile the same published ID. Use a withdrawal handoff for a rule that has lost support. A replacement rule needs a newly validated revision. Check that the withdrawn rule is absent through the same route before closing the transition. Preserve the original publication link, receipt, and reason in the archived record. If withdrawal is interrupted, keep a pending withdrawal with a retry trigger on that record and resolve it on re-entry.

## 5. Clean up and report

After incorporating results, revisit touched records and any due triggers in the selected feature. For a release review, assess the active records against their triggers and the current backlog. Age prompts inspection. Use the [state rules](references/CONTRACTS.md#states-and-reconciliation) to merge duplicates, archive terminal decisions, or remove unsupported abandoned drafts. Confirm record and feature revisions before mutations, and resolve interrupted transitions by ID.

Report the project, feature, evidence inspected, IDs and dispositions, verified publication or withdrawal, and concrete next triggers. This explicit invocation runs between tasks. TDD uses the feature document independently during its own execution.
