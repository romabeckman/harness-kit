# Paired evaluation

## Freeze before evaluation

The proposer records the revision, origin task, exact rule, prediction, refutation, and success criteria before opening any results. Pick the primary acceptance check and any process gain that can confirm the prediction when first-pass results tie. Send only the frozen record to the evaluator. The evaluator selects a different task and owns the held-out cases and raw outputs outside the proposing session and its readable project history. A pilot setup may describe case families openly. Keep the concrete task prompts, starting fixtures, and checks reserved until the freeze.

## Run and verify

For each case, start baseline and variant in isolated project copies with matching code, acceptance criteria, specs, model, effort, and budget. Use fresh sessions without shared working files or conversation history. Insert the candidate as the only added orientation in the variant feature document. Leave the baseline's feature and normal TDD path as they were. Before running, check shared instructions and examples for candidate-equivalent advice. Keep the candidate outside the canonical feature during evaluation. Discard pairs that differ in unrelated inputs or that expose the candidate to baseline or the reserved checks to either arm.

An evaluator independent of both implementations runs the same checks against their first submitted artifacts, before any rework. Check the actual test selection, RED command/output, final behavior, and whether the guidance was applied within its scope. Where detection depends on a known failure, verify that the task's test actually catches that failure on the same starting state in both arms. Include at least one in-scope case and one boundary case. Track duplicate tests and lost coverage when an existing test should suffice. Compare the interactive and autonomous RED paths as applicable, and hold the mode fixed within each pair.

## SDK diagnosis pilot

Use the project that owns `feature:sdk_diagnose`. Inspect the retry and fresh-capture tests routed by the feature. The existing retry test checks reserved trace identity within one service execution. A fresh capture must keep its own identity. This supports asking whether new tests for a *persisted* retry should exercise another service instance. A production restart failure needs separate evidence.

| Case family | Independent check |
|---|---|
| Persisted retry changes | Restore from persisted state using a new instance. Assert identity reuse and a single logical trace. Verify whether the RED caught the known failure before review. |
| Fresh capture | New logical capture gets its own identity. Check the variant skipped the retry procedure. |
| Equivalent coverage | Verify the existing test addresses the same instance boundary and assertions. Check the variant reuses it and points to its locator. |
| Contract drift | Use the current spec to verify behavior and check the stale rule is skipped and surfaced for review. |

For a pilot with a read-only source project, stage both evaluation arms in disposable project roots. A workflow fixture may verify routing and lifecycle behavior using synthetic evidence. It cannot authorize publication for SDK diagnosis.

## Record a decision

The evaluator returns a sanitized summary with the frozen digest/revision, task-set ID, distinct task IDs, paired setup/model/effort/budget and verifier IDs. For each arm and case report first delivery `pass`, `fail`, or `unknown`, detected failures before review, boundary misuse, guidance decision with test references, verification locators, and cost with units. Include independent verification of the controls and any comparison gaps.

Aggregate number of cases and verified first-pass approvals, detected failures, and boundary misapplications for each arm. Report total cost and cost per verified first-pass approval in the same units, including Dreaming preparation and reconciliation in the variant total. Report zero approvals as an undefined per-approval cost and unavailable inputs as unknown. Keep execution cost and evaluation overhead identifiable.

Validate a revision only if at least one applicable task distinct from the origin demonstrates the predicted gain, the controls pass, and the evidence supports the stated scope. Tied primary results require a predeclared and observed process gain. Counterexamples within scope refute the hypothesis. Missing or incomparable data are inconclusive. Report the next specific trigger if another attempt can resolve the uncertainty.
