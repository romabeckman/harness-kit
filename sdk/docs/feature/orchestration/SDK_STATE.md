---
doc_type: feature
domain: state
stack: [TypeScript, Node.js]
node_id: "feature:sdk_state"
tags: [state, file-state, mutations, markdown]
edges:
  - relation: implements
    target: "adr:architecture"
  - relation: tested_by
    target: "adr:tests"
updated: 2026-09-26
---

```graph
{"node_id":"feature:sdk_state","domain":"state","implements":["adr:architecture"],"tested_by":["adr:tests"],"entrypoints":["src/file-state/FileStateManager.ts"],"registration_files":[],"reference_files":["src/file-state/parsers/BacklogParser.ts"],"code_files":["src/file-state/parsers/BootstrapConfigParser.ts","src/file-state/parsers/DevStateParser.ts","src/file-state/types.ts"],"test_files":["src/file-state/__tests__/blockDependents.test.ts","src/file-state/parsers/__tests__/BacklogParser.test.ts","tests/integration/FileStateSteering.test.ts","tests/integration/t07-file-state-manager.test.ts","tests/integration/t16-file-state-f002.test.ts","tests/unit/t06-parsers.test.ts","tests/unit/t27-bootstrap-config-parser.test.ts"],"knowledge":{"schema_version":1,"entities":[{"id":"capability:file-backed-project-state","type":"capability","label":"File-backed project state","definition":"Read and mutate orchestration project state stored in files.","aliases":[]},{"id":"rule:atomic-state-replacement","type":"rule","label":"Atomic state replacement","definition":"Replace state files through a temporary file and rename to avoid partially written content.","aliases":[]}],"claims":[{"id":"claim:file-state-atomic-writes","subject":"capability:file-backed-project-state","relation":"constrained_by","object":"rule:atomic-state-replacement","statement":"FileStateManager routes state mutations through atomicWrite, which writes a temporary path and renames it to the target path.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/file-state/FileStateManager.ts","locator":"atomicWrite helper and FileStateManager mutation calls","snapshot":null}],"derived_from":[],"gap":null}]}}
```

# SDK STATE
Extends `FileStateManager` with high-level state mutation and query methods required by the orchestrator loop.

## OVERVIEW
The `sdk_state` module provides state mutations for tracking features, tasks, decisions, and reworks on disk. All methods operate on markdown files and follow strict idempotency and atomicity rules.

The backlog parser treats `-`, empty cells, and `None` as no dependencies. This keeps root features executable when bootstrap follows its documented dependency marker.

Dependency cascade writes `BLOCKED` to both the affected backlog features and all of their task rows, keeping feature and task state aligned.

## FOLDER STRUCTURE
<folder_structure>
```
sdk/src/file-state/
â”œâ”€â”€ FileStateManager.ts     # Implementation of state methods
â”œâ”€â”€ types.ts                # Interfaces like DecisionEntry
â””â”€â”€ parsers/
    â”œâ”€â”€ BacklogParser.ts    # Strips markdown wrapping from IDs
    â””â”€â”€ DevStateParser.ts   # Parses development state tables
```
</folder_structure>

## HOW TO USE FILE STATE MUTATIONS

### Prerequisites
1. Instantiate a `FileStateManager`.
2. Ensure you have the `IFileStateManager` port accessible.

### Steps
1. Call `updateFeatureStatus()` to modify status.
2. Call `appendDecision()` to log architectural decisions.

<code_example>
# CORRECT: Logging a decision specific to a feature
await fileStateManager.appendDecision({
  featureId: "F001",
  decision: "Use atomic writes"
});

# WRONG: Providing poorly formatted decision strings
await fileStateManager.appendDecision({
  featureId: "F001",
  decision: "Use atomic writes | because" // Pipe chars must be escaped by the parser
});
</code_example>

## BEST PRACTICES
REQUIRED: Call `resetTasksForRetry(featureId)` before re-entering DEVELOPMENT.
REQUIRED: Pass `DecisionEntry` with `featureId` set to the active feature ID.
PROHIBITED: Calling `incrementReworks` more than once per validation failure.

## DOCUMENT MAP

```mermaid
graph TD
    THIS["SDK State Feature"] -->|implements| ARCH["Architecture ADR"]
    THIS -->|tested_by| TESTS["Tests ADR"]
    click ARCH "../../adr/ARCHITECTURE.md"
    click TESTS "../../adr/TESTS.md"
```

## REFERENCES
- [**SDK_CORE.md**](SDK_CORE.md): Foundation â€” IFileStateManager port and adapter.
- [**SDK_AGENT_RUNNER.md**](../agents/SDK_AGENT_RUNNER.md): Outbound port implementation.
- [**ARCHITECTURE.md**](../../adr/ARCHITECTURE.md): Ports-and-Adapters structure.
