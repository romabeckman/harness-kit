---
doc_type: feature
domain: core
stack: [TypeScript, Node.js]
node_id: "feature:sdk_core"
tags: [sdk, orchestrator, state-machine, core]
edges:
  - relation: implements
    target: "adr:architecture"
  - relation: tested_by
    target: "adr:tests"
updated: 2026-09-26
---
```graph
{"node_id":"feature:sdk_core","domain":"core","implements":["adr:architecture"],"tested_by":["adr:tests"],"entrypoints":["src/orchestrator/HarnessOrchestrator.ts"],"registration_files":["src/orchestrator/ChainBuilder.ts","src/orchestrator/phases/index.ts"],"reference_files":["src/orchestrator/phases/AbstractPhaseHandler.ts"],"code_files":["src/context-assembler/ContextAssembler.ts","src/context-assembler/types.ts","src/json-extraction/JsonExtractionProtocol.ts","src/json-extraction/types.ts","src/orchestrator/ReentryResolver.ts","src/orchestrator/phases/BootstrapHandler.ts","src/orchestrator/phases/CascadeBlockedHandler.ts","src/orchestrator/phases/DeployHandler.ts","src/orchestrator/phases/DevelopmentHandler.ts","src/orchestrator/phases/MemoryHandler.ts","src/orchestrator/phases/PlanningHandler.ts","src/orchestrator/phases/RefinementHandler.ts","src/orchestrator/phases/ReviewHandler.ts","src/orchestrator/phases/TransitionHandler.ts","src/orchestrator/services/AgentInvocationService.ts","src/orchestrator/services/PhaseDecisionLogger.ts","src/orchestrator/services/ProjectStateService.ts","src/orchestrator/types.ts","src/orchestrator/utils/GitSensitiveFiles.ts","src/orchestrator/utils/OrchestratorFormatter.ts","src/orchestrator/utils/PhaseFileUtils.ts","src/orchestrator/utils/PromptHelpers.ts","src/orchestrator/utils/SessionHelpers.ts","src/settings/DefaultSettings.ts","src/settings/HarnessSettings.ts","src/telemetry/TokenLedger.ts","src/validation-gate/ValidationGate.ts","src/validation-gate/types.ts"],"test_files":["src/context-assembler/__tests__/ContextAssembler.test.ts","src/orchestrator/__tests__/HarnessOrchestrator.test.ts","src/orchestrator/phases/__tests__/BootstrapHandler.test.ts","src/orchestrator/phases/__tests__/CascadeBlockedHandler.test.ts","src/orchestrator/phases/__tests__/PhaseAHandler.test.ts","src/orchestrator/phases/__tests__/PhaseBHandler.test.ts","src/orchestrator/phases/__tests__/PhaseFHandler.test.ts","src/orchestrator/phases/__tests__/RefinementHandler.test.ts","src/orchestrator/phases/__tests__/ReviewHandler.test.ts","src/orchestrator/services/__tests__/ProjectStateService.test.ts","src/orchestrator/services/__tests__/ProjectStateService.spec-readiness.test.ts","src/orchestrator/utils/__tests__/GitSensitiveFiles.test.ts","src/orchestrator/utils/__tests__/PhaseFileUtils.test.ts","src/orchestrator/utils/__tests__/PromptHelpers.test.ts","src/validation-gate/__tests__/ValidationGate.test.ts","tests/integration/t11-orchestrator-bootstrap-phasea.test.ts","tests/integration/t12-orchestrator-phaseb.test.ts","tests/integration/t13-orchestrator-phasec.test.ts","tests/unit/phases/t04-phasec-handler.test.ts","tests/unit/phases/t06-phasee-handler.test.ts","tests/unit/t09-reentry-resolver.test.ts","tests/unit/t10-state-machine.test.ts"],"knowledge":{"schema_version":1,"entities":[{"id":"capability:orchestration-cycle","type":"capability","label":"Orchestration cycle","definition":"Run the project workflow through persisted phases using configured handlers and state.","aliases":[]}],"claims":[{"id":"claim:orchestrator-phase-chain","subject":"capability:orchestration-cycle","relation":null,"object":null,"statement":"HarnessOrchestrator.run enters the resolved re-entry phase and processes the configured phase chain until the orchestration loop completes.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/orchestrator/HarnessOrchestrator.ts","locator":"run and ReentryResolver.resolve call","snapshot":null}],"derived_from":[],"gap":null}]}}
```

# SDK CORE

Implements SDK orchestration as an importable library.

## OVERVIEW
`sdk_core` provides `HarnessOrchestrator`, phase handlers, payloads, validation, and state ports.

## FOLDER STRUCTURE
<folder_structure>
```
sdk/src/
â”œâ”€â”€ index.ts                          # Public re-exports only
â”œâ”€â”€ orchestrator/
â”‚   â”œâ”€â”€ HarnessOrchestrator.ts        # State machine loop & session storage
â”‚   â”œâ”€â”€ phases/                       # Chain-of-Responsibility handlers
â”‚   â””â”€â”€ ReentryResolver.ts            # Ordered re-entry predicates
â”œâ”€â”€ file-state/
â”‚   â””â”€â”€ FileStateManager.ts           # IFileStateManager implementation
â”œâ”€â”€ context-assembler/
â”‚   â””â”€â”€ ContextAssembler.ts           # Per-phase payload builders
â”œâ”€â”€ validation-gate/
â”‚   â””â”€â”€ ValidationGate.ts             # Pure evaluate() function
```
</folder_structure>

## MAIN CONCEPTS

### State Machine Architecture
- **Ports and adapters**: Keep orchestration independent from runners and persistence.
- **State safety**: Use atomic writes and never-throw JSON extraction outcomes.
- **Sessions**: Isolate `{featureId,agent,session,phase}`; resumed prompts cite feature, business context, specs, and projects.
- **Refinement/bootstrap/planning**: Run optional PBB refinement before bootstrap only when no populated backlog exists. A populated backlog starts or resumes at PLANNING or later; PLANNING marks the selected feature `IN_PROGRESS` and never returns to REFINEMENT.
- **Project setup**: REFINEMENT asks the LLM to inspect project evidence and ask up to four additional architecture and design questions when a project is initial or lacks working implementation. BOOTSTRAP invokes `harness-kit:project-memory` once if any configured project lacks `docs/.digest.md` or `docs/.graph.json`; its prompt includes the selected scope, lists every root, handles each independently, and targets only incomplete documentation.
- **Review/transition**: Review or cascade handling must persist a terminal feature status (`COMPLETED`, `BLOCKED`, or `FAILED`) before TRANSITION. TRANSITION rejects non-terminal active features, clears their sessions, and routes the next backlog feature to PLANNING.
- **Resume consistency**: Prefer the configured active feature when rebuilding state so a terminal feature remains available to TRANSITION after a restart.
- **Review/memory**: Carry compact TDD metrics/files/handoff; verify docs from decisions, final TL/QA, rework, and changed files without process history

## HOW TO USE THE ORCHESTRATOR API

Instantiate `HarnessOrchestrator` with scope, project paths, and an `IAgentRunner`; call `run()` to start or resume the state machine.

## PARAMETERS / CONFIGURATIONS

| Name | Type | Required | Description | Default |
|---|---|---|---|---|
| `scope` | string | Yes | The objective for the current cycle | â€” |
| `projectPaths` | string[] | Yes | Directories involved | â€” |
| `agentRunner` | IAgentRunner | No | Runner implementation | Auto-detected |
| `productDir` | string | No | Custom output directory for docs | `docs/product/` |

## BEST PRACTICES

REQUIRED: Check staged Git paths with the shared sensitive-file utility before deployment.
REQUIRED: Use `isExtractionError` / `isExtractionResult` type guards to branch on extraction outcomes.
REQUIRED: Keep `001-*` and `002-*` files at most 5,000 characters with `InlinePolicy = 'never'`.
ALLOWED: Generate `003-*` and `004-*` files with `InlinePolicy = 'always'`.
REQUIRED: Ground `HIGH`-complexity refinement answers in each applicable `003-${PROJECT_NAME}-tactical-design.md`.
REQUIRED: Pass the active runner to `inlineOrReference`; `writePromptToStdin = false` emits file references only.
REQUIRED: Render Bootstrap, Planning, Refinement, Development retries, Review, and Memory business context with policy `always`; Bootstrap, Planning, Development retries, Review, and Memory select `REFINEMENT.md` when present, otherwise `SCOPE.md`, and never pass both. Refinement consumes `SCOPE.md` to create `REFINEMENT.md`. Honor `FORCE_INLINE_MAX` (15,000 chars) when rendering content.
REQUIRED: Invoke `harness-kit:pbb-design` during optional REFINEMENT, transition to BOOTSTRAP, and preserve PBB decisions and provisional assumptions in Planning.
ALLOWED: Ask 0â€“12 PBB gap questions; keep `Frontend Screens & Visualization` as an optional evidence-based complement.
PROHIBITED: Mutating state directly without using `IFileStateManager`.
REQUIRED: Tag `DeveloperSessionState` with `phase` to isolate development and review.
REQUIRED: Resume matching retry sessions with `REWORK-LOG.md`; otherwise use a standalone prompt.
REQUIRED: Reuse review sessions on retry; clear feature sessions after transition.
REQUIRED: Run Tech Lead and adversarial QA reviews when validation is enabled, including fast mode.
REQUIRED: Separate typed `readTddOutput` parsing from `summarizeTddOutput` audit formatting.
REQUIRED: In `LOW` planning, request only `003-*` and `004-*`; never generate global `001-*` or `002-*` documents.
REQUIRED: Accept planning only with ordered tasks, non-empty scenarios, and task rows owned by the active feature.
REQUIRED: Advance to `REVIEW` after the development agent invocation completes. When TDD output already exists, mark pending tasks `COMPLETED` before review.
REQUIRED: Use existing `TDD-OUTPUT.json` as a resume signal; skip another development invocation and send the feature to review.
REQUIRED: Treat `TDD-OUTPUT.json` as optional review context, not as a phase-transition gate.
REQUIRED: When review is skipped, record the decision without synthetic Tech Lead or QA scores.
REQUIRED: Summarize completed work and review focus in `TDD-OUTPUT.json.developerHandoff` using at most 500 characters.

## REFERENCES

- [**ARCHITECTURE.md**](../../adr/ARCHITECTURE.md): Architectural decisions like Ports and Adapters.
- [**TESTS.md**](../../adr/TESTS.md): Test documentation.
