# RED orientation publication

Use this procedure for an explicit [Project Dreaming handoff](../../project-dreaming/references/CONTRACTS.md#project-memory-handoff).

1. **Select scope.** Resolve the exact destination against the feature's node in `docs/.graph.json` and its top graph, in the supplied project. If routing is stale or absent, use the normal index workflow to reconcile it before confirming publication.
2. **Ground.** Check the expected published revision, feature ownership, current contract, and handoff decision. Inspect accessible evidence outside harness history. For a publication, verify the conclusion and controls support the procedure and scope. For a withdrawal, inspect the counterevidence or changed contract. Send unresolved support or a revision conflict back to Dreaming with its locator.
3. **Update.** Put the validated procedure in the published section, keyed by the stable ID. Use the expected revision as a compare-and-set condition. Identical replays of a completed publish or withdrawal return `already_current` when the feature meets the file limit. Preserve other guidance entries. A replacement revision must advance the published revision and be independently validated. For withdrawal remove only the identified entry. An empty section or no section has the same effect on TDD. Before writing, check the resulting feature against the [20,000-character file limit](../SKILL.md#total-context-budget). If a split is needed and authorized, keep the guidance in the handoff destination, reconcile affected routes and references, and validate each resulting file. Leave the handoff pending if the result cannot meet the limit within scope.
4. **Consolidate.** Check the affected ID and evidence links. Preserve all unaffected feature prose, routing and claims.
5. **Curate.** Feature-local guidance is discoverable in the feature. Assess the digest under its ordinary selection rules.
6. **Validate.** Apply normal canonical checks and resolve the section through the same feature route used by TDD. Return the verified receipt defined by the handoff contract. Only a matching, resolvable entry, or a verified removal for withdrawal, completes the transition.

On systems with Python 3 and POSIX file locking, the [publication helper](../../project-dreaming/scripts/red_orientation.py) applies the canonical edit after evidence is grounded and checks graph routing, source locators, and revision. Pass the handoff JSON on stdin:

```bash
python3 <skill-directory>/../project-dreaming/scripts/red_orientation.py <project-directory> < <handoff.json>
```

The helper checks structural preconditions. The six Project Memory stages govern evidence and final validation. If the helper cannot be used, apply the same revision and verification conditions in the document workflow and use an atomic replacement.
