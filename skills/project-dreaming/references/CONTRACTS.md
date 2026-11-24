# Project Dreaming contracts

## Hypothesis record

Use one UTF-8 Markdown file per hypothesis under `docs/harness-history/learning/active/<id>.md` or `archived/<id>.md` in the owning project. The project directory and feature node ID qualify each ID across a workspace. Choose a stable lowercase kebab-case ID unique within that project. Keep the ID across revisions and moves. Keep evidence paths project-relative and pair each with a specific test title, heading, range, or execution locator. For a session-only source give the session ID and event locator. Include a revision, digest, or run ID when available.

```yaml
---
schema_version: 1
id: statement-export-page-boundary
revision: 1
status: candidate
feature_node_id: "feature:statement_export"
phase: before-red
applies_when: "A task changes ordering in a paginated statement export."
proposed_action: "Test an entry tied on the primary sort key across a page boundary."
skip_when: "The export is unpaginated or already checks the same boundary."
prediction: "The selected test catches a lost or repeated row before review."
refutation: "The baseline catches the same failure or the extra test duplicates equivalent coverage."
review_trigger: "Next task changing pagination or the statement export ordering."
---
```

Use these three headings:

- `## Origin evidence` contains one entry per stable locator with the source task/episode ID, source path or session ID, locator, snapshot/run when available, and what it supports. Give at least one verifiable origin for a candidate.
- `## Evaluations` contains one `### <evaluation-id>` per attempt. Before results, record hypothesis revision, freeze date and immutable snapshot identifier/digest, frozen condition, action, exception, prediction, refutation and decision rule, and the opaque evaluation task-set ID. After verification, fill in baseline and variant results for each case, distinct task IDs, mode, comparison settings, verifier identities/checks, locators and decision rationale. Keep the original freeze visible. Update a repeated evaluation ID in place only for the same revision, frozen contract, and case set. Conflicting results require reconciliation or a separate attempt.
- `## Outcome` contains terminal disposition, reason, date and destination when applicable. For publication or withdrawal include the feature path/node, stable orientation ID, affected revision and verified receipt. For a validated revision awaiting publication record the retry trigger. For pending withdrawal record the expected published revision and retry trigger until verified. An alias contains its own original ID and a pointer to the canonical record.

Increment `revision` for changes to conditions, action, exception, prediction, or refutation. Preserve evaluated snapshots and outcomes under their original revision. Reopen the same ID in `active/` when revising an archived decision, preserving its prior disposition in the record.

Use this record for each paired attempt. Complete the freeze before the evaluator reports results.

```markdown
### <evaluation-id>

- Revision and freeze: <revision>, <date>, <digest or immutable snapshot>
- Frozen condition, action and exception: <exact text or snapshot locator>
- Frozen prediction, refutation and success criterion: <exact text or snapshot locator>
- Origin task and reserved task set: <origin ID>, <opaque set ID>
- Matched setup: <start snapshot>, <criteria/spec revision>, <mode>, <model>, <effort>, <budget>
- Verified by: <independent verifier identity and check locators>

| Case ID | Baseline first delivery and RED | Variant first delivery and RED | Control result | Verifier evidence | Baseline and variant cost |
| --- | --- | --- | --- | --- | --- |
| <distinct task> | <outcome and locator> | <outcome, decision and locator> | <result> | <check locator> | <value and unit for each arm> |

- Aggregate approvals, early detections and boundary misuse: <by arm over comparable cases>
- Dreaming cost and cost per first-pass approval: <value and unit or unknown>
- Decision and rationale: <validated, refuted or inconclusive and supporting evidence>
- Next trigger: <concrete condition when the attempt remains open>
```

## States and reconciliation

| State | Queue and decision |
|---|---|
| `candidate` | Active with source and a concrete next evaluation trigger. |
| `in_evaluation` | Active with frozen revision and a selected evaluation. Inconclusive attempts need a new trigger to stay active. |
| `validated` | Active until the canonical publication is confirmed. |
| `published` | Archived with the verified publication link and evaluation. |
| `refuted` | Archived with counterexample and rationale. |
| `obsolete`, `inconclusive` | Close when the contract/backlog changes or evaluation has ended without useful evidence and a next trigger. Archive when evaluated, published, or externally referenced. Preserve verifiable origins with a recorded disposition if retained. |
| `duplicate` | Merge distinct evidence into the canonical record first. Remove the redundant record only after verifying absence of references. Otherwise archive the ID with a pointer. |

An unsupported draft can be deleted after checking absence of evidence, evaluations, inbound references, and a task against which it can be tested. If these checks are incomplete, retain it with the unresolved check as a trigger.

Before editing verify the read revision and file contents against disk. On concurrent edits reload and reconcile by stable ID, merging only compatible evidence. Use atomic file replacement and an atomic same-project move between queues. If both locations already contain the same ID after an interrupted edit, reconcile evidence and confirmed disposition before removing a redundant copy. Preserve the record until publication or withdrawal is independently verified. Idempotent re-entry must neither duplicate a rule nor renumber an existing result.

## Published orientation

The owning feature can have one top-level `## RED guidance` section. It contains a JSON array in a `json` fence. This is a procedure for test selection. Existing requirements and specs govern behavior. TDD reads only this portion of the selected feature's prose for orientation. Absence or an empty array means there is no guidance.

```json
[
  {
    "id": "statement-export-page-boundary",
    "revision": 1,
    "applies_when": "The task changes ordering in a paginated statement export.",
    "action": "Test an entry tied on the primary sort key across a page boundary.",
    "skip_when": "The export is unpaginated or already checks the same boundary.",
    "sources": [
      {
        "path": "tests/statement_export.test.ts",
        "locator": "preserves tied rows when advancing the statement cursor",
        "snapshot": "commit-or-digest"
      }
    ]
  }
]
```

Illustrative values above require independent verification before publication. Keep a stable ID and positive integer revision. At least one source must resolve inside the project. Use exact text as the locator and an optional historical snapshot. Recheck current source meaning and scope whenever applying the rule. A changed source can still support the rule after inspection. A missing, contradictory, or unverifiable source results in skipped guidance and a review locator.

## Project Memory handoff

Deliver a JSON object inline or in a temporary file outside harness history, with this structure:

```json
{
  "operation": "publish",
  "feature_node_id": "feature:statement_export",
  "destination": "docs/feature/STATEMENT_EXPORT.md",
  "hypothesis_id": "statement-export-page-boundary",
  "revision": 1,
  "expected_published_revision": null,
  "orientation": {
    "id": "statement-export-page-boundary",
    "revision": 1,
    "applies_when": "The task changes ordering in a paginated statement export.",
    "action": "Test an entry tied on the primary sort key across a page boundary.",
    "skip_when": "The export is unpaginated or already checks the same boundary.",
    "sources": [
      {"path": "tests/statement_export.test.ts", "locator": "preserves tied rows when advancing the statement cursor"}
    ]
  },
  "evidence": {
    "evaluation_id": "distinct-attempt-id",
    "result": "verified summary of the two arms, controls, and rationale",
    "sources": [
      {"path": "project-relative evidence accessible to Project Memory", "locator": "exact text"}
    ]
  }
}
```

Use an orientation object for publish. For `withdraw`, omit `orientation`, send the revision being withdrawn and expect that same canonical revision, and give the reason and directly inspectable counterevidence. For replacement, retain the ID and use the previous canonical revision as the expected revision. The evidence summary must provide checkable support directly. It may cite the ID of an independent evaluation for correlation. Keep raw reserved materials with the evaluator and keep all history reads/writes with Project Dreaming. A factual correction is handled by Project Memory's normal claim and evidence workflow.

Project Memory returns a receipt with the operation, destination, feature node, ID, revision, result (`written`, `already_current`, or `conflict`), and the checks performed. A conflict or unresolved evidence keeps the operation pending. A retry uses the original handoff and ID for the current pending transition. Check the decision history before sending a retry and discard any superseded request, including a publish superseded by withdrawal. A canonical entry with equal revision and different content is a conflict.

To route a validated handoff through a future SDK MEMORY phase, place it in the orchestration workspace's `docs/product/project-dreaming/handoffs/<id>.json`. Wrap the object in an envelope with `status: "ready"`, the owning `project` path as configured in the SDK, and the complete object as `handoff`. The SDK records `applied` when it verifies the canonical result. Recheck the published or withdrawn entry before closing the learning record.

## TDD use

The optional `orientation_use` array in a trace or structured TDD output uses this object shape:

```json
{
  "orientation_id": "statement-export-page-boundary",
  "revision": 1,
  "feature": "feature:statement_export",
  "project": "statements",
  "decision": "applied",
  "reason": "Added a tied sort key at the existing scenario's page boundary.",
  "test_ref": "scenario ID and/or project-relative test path with locator"
}
```

Decisions are `applied`, `covered`, `skipped`, and `needs_refinement`. In a multi-project SDK workspace, use the task's project tag in `project` to scope the decision. The field can be omitted for a single project or direct sessions without a project tag. Omit `test_ref` if there is no scenario or test to reference. An absent array means unknown. An observed empty array means the lookup found no guidance in scope. Keep actual test outcomes in execution evidence referenced by the associated trace step, or in the direct session with its command and observed result.
