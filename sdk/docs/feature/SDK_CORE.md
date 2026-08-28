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
updated: "2026-08-28"
---
```graph
{
  "node_id": "feature:sdk_core",
  "domain": "core",
  "implements": ["adr:architecture"],
  "tested_by": ["adr:tests"],
  "entrypoints": ["src/orchestrator/HarnessOrchestrator.ts"],
  "registration_files": ["src/orchestrator/ChainBuilder.ts","src/orchestrator/phases/index.ts"],
  "reference_files": ["src/orchestrator/phases/AbstractPhaseHandler.ts"],
  "code_files": ["src/context-assembler/ContextAssembler.ts","src/context-assembler/types.ts","src/json-extraction/JsonExtractionProtocol.ts","src/json-extraction/types.ts","src/orchestrator/ReentryResolver.ts","src/orchestrator/phases/BootstrapHandler.ts","src/orchestrator/phases/CascadeBlockedHandler.ts","src/orchestrator/phases/DeployHandler.ts","src/orchestrator/phases/DevelopmentHandler.ts","src/orchestrator/phases/MemoryHandler.ts","src/orchestrator/phases/PlanningHandler.ts","src/orchestrator/phases/RefinementHandler.ts","src/orchestrator/phases/ReviewHandler.ts","src/orchestrator/phases/TransitionHandler.ts","src/orchestrator/services/AgentInvocationService.ts","src/orchestrator/services/PhaseDecisionLogger.ts","src/orchestrator/services/ProjectStateService.ts","src/orchestrator/types.ts","src/orchestrator/utils/OrchestratorFormatter.ts","src/orchestrator/utils/PhaseFileUtils.ts","src/orchestrator/utils/PromptHelpers.ts","src/orchestrator/utils/SessionHelpers.ts","src/telemetry/TokenLedger.ts","src/validation-gate/ValidationGate.ts","src/validation-gate/types.ts"],
  "test_files": ["src/context-assembler/__tests__/ContextAssembler.test.ts","src/orchestrator/__tests__/ChainBuilder.test.ts","src/orchestrator/__tests__/HarnessOrchestrator.test.ts","src/orchestrator/__tests__/types.test.ts","src/orchestrator/phases/__tests__/BootstrapHandler.test.ts","src/orchestrator/phases/__tests__/PhaseAHandler.test.ts","src/orchestrator/phases/__tests__/PhaseBHandler.test.ts","src/orchestrator/phases/__tests__/PhaseFHandler.test.ts","src/orchestrator/phases/__tests__/RefinementHandler.test.ts","src/orchestrator/phases/__tests__/ReviewHandler.test.ts","src/orchestrator/services/__tests__/AgentInvocationService.test.ts","src/orchestrator/services/__tests__/PhaseDecisionLogger.test.ts","src/orchestrator/services/__tests__/ProjectStateService.test.ts","src/orchestrator/utils/__tests__/PhaseFileUtils.test.ts","src/orchestrator/utils/__tests__/PromptHelpers.test.ts","src/orchestrator/utils/__tests__/SessionHelpers.test.ts","src/telemetry/__tests__/TokenLedger.test.ts","src/validation-gate/__tests__/ValidationGate.test.ts","tests/integration/t11-orchestrator-bootstrap-phasea.test.ts","tests/integration/t12-orchestrator-phaseb.test.ts","tests/integration/t13-orchestrator-phasec.test.ts","tests/integration/t14-orchestrator-phased-e.test.ts","tests/unit/phases/t04-phasec-handler.test.ts","tests/unit/phases/t06-phasee-handler.test.ts","tests/unit/phases/t07-deploy-handler.test.ts","tests/unit/phases/t08-refinement-handler.test.ts","tests/unit/t02-types.test.ts","tests/unit/t04-json-extraction.test.ts","tests/unit/t05-validation-gate.test.ts","tests/unit/t08-context-assembler.test.ts","tests/unit/t09-reentry-resolver.test.ts","tests/unit/t10-state-machine.test.ts"]
}
```

# SDK CORE

Implements the autonomous-orchestrator state machine as an importable library.

## OVERVIEW
`sdk_core` provides `HarnessOrchestrator`, phase handlers, payloads, validation, and state ports.

## FOLDER STRUCTURE
<folder_structure>
```
sdk/src/
├── index.ts                          # Public re-exports only
├── orchestrator/
│   ├── HarnessOrchestrator.ts        # State machine loop & session storage
│   ├── phases/                       # Chain-of-Responsibility handlers
│   └── ReentryResolver.ts            # Ordered re-entry predicates
├── file-state/
│   └── FileStateManager.ts           # IFileStateManager implementation
├── agent-runner/
│   └── NullAgentRunner.ts            # No-op stub
├── context-assembler/
│   └── ContextAssembler.ts           # Per-phase payload builders
├── validation-gate/
│   └── ValidationGate.ts             # Pure evaluate() function
└── telemetry/
    └── TokenLedger.ts                # JSONL-backed token usage recorder
```
</folder_structure>

## MAIN CONCEPTS

### State Machine Architecture
- **Ports and adapters**: Keep orchestration independent from runners and persistence.
- **State safety**: Use atomic writes and never-throw JSON extraction outcomes.
- **Sessions**: Isolate `{ featureId, agent, session, phase }`; resume matching rework sessions and clear them after transition.
- **Development contract**: Parse typed `TddOutput` for handoff and audit context; advance after developer invocation.
- **Review handoff**: Inject `developerHandoff` (maximum 500 characters) into `ReviewPayload`; reviewers verify every claim.

## HOW TO USE THE ORCHESTRATOR API

### Steps
1. Import `HarnessOrchestrator` from `@romabeckman/hrns`.
2. Instantiate it with required options and an `IAgentRunner`.
3. Call `run()`.

<code_example>
# CORRECT: Supply required orchestration context
const orchestrator = new HarnessOrchestrator({
  scope: "Implement login",
  projectPaths: ["./src"],
  agentRunner: myAgentRunner,
  complexity: "AUTO"
});
await orchestrator.run();

# WRONG: Omit required context
const orchestrator = new HarnessOrchestrator({});
</code_example>

## PARAMETERS / CONFIGURATIONS

| Name | Type | Required | Description | Default |
|---|---|---|---|---|
| `scope` | string | Yes | The objective for the current cycle | — |
| `projectPaths` | string[] | Yes | Directories involved | — |
| `agentRunner` | IAgentRunner | No | Runner implementation | Auto-detected |
| `productDir` | string | No | Custom output directory for docs | `docs/product/` |

## BEST PRACTICES

REQUIRED: Use `isExtractionError` / `isExtractionResult` type guards to branch on extraction outcomes.
REQUIRED: Keep `001-*` and `002-*` files at most 5,000 characters with `InlinePolicy = 'never'`.
ALLOWED: Generate `003-*` and `004-*` files with `InlinePolicy = 'always'`.
REQUIRED: For `HIGH` complexity, read `001-problem-space.md` and explicitly answer every question from its `Socratic Questions` section in downstream `003–004` artifacts.
REQUIRED: Pass the active runner to `inlineOrReference`; `writePromptToStdin = false` forces inline content plus source path.
REQUIRED: Render Bootstrap, Planning, and Refinement scope with policy `always` and canonical `SCOPE.md`; otherwise honor `FORCE_INLINE_MAX` (15,000 chars).
PROHIBITED: Mutating state directly without using `IFileStateManager`.
REQUIRED: Tag `DeveloperSessionState` with `phase` to isolate development and review.
REQUIRED: Resume matching retry sessions with `REWORK-LOG.md`; otherwise use a standalone prompt.
REQUIRED: Reuse review sessions on retry; clear feature sessions after transition.
REQUIRED: Separate typed `readTddOutput` parsing from `summarizeTddOutput` audit formatting.
REQUIRED: Advance directly to `REVIEW` after developer invocation; do not loop `DEVELOPMENT` on result validation.
REQUIRED: Summarize completed work and review focus in `TDD-OUTPUT.json.developerHandoff` using at most 500 characters.

## DOCUMENT MAP

```mermaid
graph TD
    THIS["SDK Core Feature"] -->|implements| ARCH["Architecture ADR"]
    THIS -->|tested_by| TESTS["Tests ADR"]
    click ARCH "../adr/ARCHITECTURE.md"
    click TESTS "../adr/TESTS.md"
```

## REFERENCES

- [**ARCHITECTURE.md**](../adr/ARCHITECTURE.md): Architectural decisions like Ports and Adapters.
- [**TESTS.md**](../adr/TESTS.md): Test documentation.
