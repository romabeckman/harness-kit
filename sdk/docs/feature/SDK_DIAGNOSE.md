---
doc_type: feature
domain: diagnose
stack: [TypeScript, Node.js, Vitest]
node_id: "feature:sdk_diagnose"
tags: [diagnose, meta-harness, traces, ledger, session]
edges:
  - relation: implements
    target: "adr:architecture"
  - relation: tested_by
    target: "adr:tests"
  - relation: depends_on
    target: "feature:sdk_agent_runner"
  - relation: depends_on
    target: "feature:sdk_settings"
updated: "2026-08-18"
---

```graph
{
  "node_id": "feature:sdk_diagnose",
  "domain": "diagnose",
  "implements": ["adr:architecture"],
  "tested_by": ["adr:tests"],
  "depends_on": ["feature:sdk_agent_runner", "feature:sdk_settings"],
  "entrypoints": ["src/diagnose/DiagnoseService.ts"],
  "registration_files": ["src/index.ts"],
  "reference_files": ["src/diagnose/JsonlSessionLedger.ts", "src/diagnose/SessionIdGenerator.ts"],
  "code_files": [
    "src/diagnose/CandidatePromotionService.ts",
    "src/diagnose/CandidateReader.ts",
    "src/diagnose/DiagnoseReportRenderer.ts",
    "src/diagnose/MetaHarnessAgentAdapter.ts",
    "src/diagnose/TraceDirectoryScanner.ts",
    "src/diagnose/types.ts",
    "src/diagnose/utils/DiagnosePaths.ts"
  ],
  "test_files": [
    "src/diagnose/__tests__/CandidatePromotionService.test.ts",
    "src/diagnose/__tests__/CandidateReader.test.ts",
    "src/diagnose/__tests__/DiagnoseReportRenderer.test.ts",
    "src/diagnose/__tests__/DiagnoseService.test.ts",
    "src/diagnose/__tests__/JsonlSessionLedger.test.ts",
    "src/diagnose/__tests__/MetaHarnessAgentAdapter.test.ts",
    "src/diagnose/__tests__/SessionIdGenerator.test.ts",
    "src/diagnose/__tests__/TraceDirectoryScanner.test.ts",
    "src/diagnose/__tests__/types.test.ts",
    "src/diagnose/utils/__tests__/DiagnosePaths.test.ts"
  ]
}
```

# SDK DIAGNOSE
Automates execution trace recording, session ledger persistence, meta-harness optimization triggering, terminal diagnosis reporting, and candidate review delegation.

## OVERVIEW
The diagnose module captures orchestration performance in `docs/product/diagnose-sessions.jsonl` (recording runner, agent, skill, model, effort, phase across all executions, and domain during `DEVELOPMENT` and `REVIEW` phases). It processes pending sessions in batches, generates sequential trace session IDs (`session-YYYY-MM-DD-NNN`), delegates trace logging to `harness-kit:meta-harness-agent`, triggers candidate generation upon completing batches, renders diagnosis reports, and delegates candidate review/promotion interactively or autonomously via `CandidatePromotionService`.

## FOLDER STRUCTURE
<folder_structure>
```
src/diagnose/
├── CandidatePromotionService.ts # Builds prompts, runner commands, and spawns review
├── CandidateReader.ts           # Extracts candidate metadata and verifies applied status
├── DiagnoseReportRenderer.ts    # Formats and renders final diagnosis report
├── DiagnoseService.ts           # Core coordinator for batch processing and capture
├── JsonlSessionLedger.ts        # Atomic JSONL persistence and batch status rewriting
├── SessionIdGenerator.ts        # Sequential session ID generator (session-YYYY-MM-DD-NNN)
├── TraceDirectoryScanner.ts     # Filesystem scanner for trace sequence numbers
├── MetaHarnessAgentAdapter.ts   # Adapter invoking meta-harness agent and tracer
├── types.ts                     # Interfaces, snapshot types, and candidate types
└── utils/
    └── DiagnosePaths.ts         # Centralized path builder for history and ledgers
```
</folder_structure>

## ARCHITECTURAL COMPONENTS

### Core Services
- **`DiagnoseService`**: Coordinates session capture, batch resolution, agent adapter execution, atomic status transitions, and report aggregation.
- **`CandidateReader`**: Parses candidate generation results and verifies status (`PROMOTED`, `APPLIED`, `PROPOSED`).
- **`CandidatePromotionService`**: Builds prompts and launches interactive or autonomous review across runners.
- **`DiagnoseReportRenderer`**: Formats terminal summary with session counts, trace IDs, and candidate application steps.
- **`JsonlSessionLedger`**: Implements atomic file rewriting and batch status updates (`rewriteBatchStatuses`).
- **`SessionIdGenerator`**: Calculates sequential session IDs matching existing date folders.
- **`TraceDirectoryScanner`**: Inspects disk to determine next sequence number for the day.
- **`MetaHarnessAgentAdapter`**: Translates diagnose session records into autonomous agent prompts.

## HOW TO RUN DIAGNOSIS

### Prerequisites
1. Ensure `docs/product/diagnose-sessions.jsonl` exists with at least one pending record.
2. Configure agent runner settings for the `diagnose` phase.

### Steps
1. Instantiate `JsonlSessionLedger`, `TraceDirectoryScanner`, `SessionIdGenerator`, and `MetaHarnessAgentAdapter`.
2. Construct `DiagnoseService`.
3. Call `processAllPendingInBatches()`.

<code_example>
// # CORRECT: Initialize DiagnoseService with injected dependencies
const scanner = new TraceDirectoryScanner(workspacePath);
const idGenerator = new SessionIdGenerator(scanner);
const ledger = new JsonlSessionLedger(ledgerPath);
const agentAdapter = new MetaHarnessAgentAdapter({ workingDir: workspacePath });

const diagnoseService = new DiagnoseService({
  ledger,
  agentAdapter,
  idGenerator,
  settings: HarnessSettings.load(workspacePath),
});

await diagnoseService.processAllPendingInBatches(3);

// # WRONG: Mutating session files directly without atomic ledger or session ID sequencing
fs.writeFileSync('docs/product/diagnose-sessions.jsonl', JSON.stringify({ status: 'completed' }));
</code_example>

## PARAMETERS / CONFIGURATIONS

| Parameter | Type | Required | Description | Default |
|---|---|---|---|---|
| `batchSize` | number | No | Number of pending sessions to process per batch | `3` |
| `onProgress` | function | No | Callback invoked after each batch with `BatchResult` | `undefined` |
| `workingDir` | string | No | Workspace root directory | `process.cwd()` |
| `cliSettings` | DiagnoseSettings | No | CLI runner, model, and effort overrides | `undefined` |
| `settings` | HarnessSettings | No | Project settings containing phase overrides | Loaded from disk |

## BEST PRACTICES
REQUIRED: Use `JsonlSessionLedger` for all session state mutations to prevent file corruption.
REQUIRED: Always generate session IDs through `SessionIdGenerator` to ensure monotonic trace numbering.
REQUIRED: Catch and log adapter invocation errors while preserving `pending` status for retry.
REQUIRED: Trigger `invokeMetaHarness` only after successfully processing batches of pending sessions.
PROHIBITED: Hardcoding model or effort levels; resolve configuration through `HarnessSettings` or CLI arguments.
PROHIBITED: Deleting or editing raw trace directories directly from `DiagnoseService`.

## DOCUMENT MAP

```mermaid
graph TD
    THIS["SDK Diagnose Feature"] -->|implements| ARCH["Architecture ADR"]
    THIS -->|tested_by| TESTS["Tests ADR"]
    THIS -->|depends_on| RUNNER["SDK Agent Runner Feature"]
    THIS -->|depends_on| SETTINGS["SDK Settings Feature"]
    click ARCH "../adr/ARCHITECTURE.md"
    click TESTS "../adr/TESTS.md"
    click RUNNER "./SDK_AGENT_RUNNER.md"
    click SETTINGS "./SDK_SETTINGS.md"
```

## REFERENCES
- [**SDK_CLI.md**](./SDK_CLI.md): `hrns diagnose` and `hrns candidate` commands.
- [**SDK_AGENT_RUNNER.md**](./SDK_AGENT_RUNNER.md): `AgentRunnerFactory` and `IAgentRunner` interface.
- [**SDK_SETTINGS.md**](./SDK_SETTINGS.md): `HarnessSettings` resolution for diagnose phase.
- [**ARCHITECTURE.md**](../adr/ARCHITECTURE.md): System architecture and integration boundaries.
- [**TESTS.md**](../adr/TESTS.md): Test guidelines and execution commands.
