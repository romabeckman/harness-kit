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
updated: 2026-11-26
---
```graph
{"node_id":"feature:sdk_core","domain":"core","implements":["adr:architecture"],"tested_by":["adr:tests"],"entrypoints":["src/orchestrator/HarnessOrchestrator.ts"],"registration_files":["src/orchestrator/ChainBuilder.ts","src/orchestrator/phases/index.ts"],"reference_files":["src/orchestrator/phases/AbstractPhaseHandler.ts","src/orchestrator/prompts/development/red-guidance.md","src/orchestrator/prompts/refinement/next-question.md"],"code_files":["src/context-assembler/ContextAssembler.ts","src/context-assembler/types.ts","src/json-extraction/JsonExtractionProtocol.ts","src/json-extraction/types.ts","src/orchestrator/ReentryResolver.ts","src/orchestrator/phases/BootstrapHandler.ts","src/orchestrator/phases/CascadeBlockedHandler.ts","src/orchestrator/phases/DeployHandler.ts","src/orchestrator/phases/DevelopmentHandler.ts","src/orchestrator/phases/MemoryHandler.ts","src/orchestrator/phases/PlanningHandler.ts","src/orchestrator/phases/RefinementHandler.ts","src/orchestrator/phases/ReviewHandler.ts","src/orchestrator/phases/TransitionHandler.ts","src/orchestrator/services/AgentInvocationService.ts","src/orchestrator/services/PhaseDecisionLogger.ts","src/orchestrator/services/ProjectStateService.ts","src/orchestrator/services/ReviewFailureService.ts","src/orchestrator/types.ts","src/orchestrator/utils/GitSensitiveFiles.ts","src/orchestrator/utils/OrchestratorFormatter.ts","src/orchestrator/utils/PhaseFileUtils.ts","src/orchestrator/utils/PromptHelpers.ts","src/orchestrator/utils/SessionHelpers.ts","src/settings/DefaultSettings.ts","src/settings/HarnessSettings.ts","src/telemetry/TokenLedger.ts","src/validation-gate/ValidationGate.ts","src/validation-gate/types.ts","src/orchestrator/utils/PromptTemplate.ts","src/file-state/DreamingEpisodeStore.ts","src/file-state/DreamingHandoffs.ts","src/file-state/DreamingAnalysis.ts","src/orchestrator/utils/PbbContract.ts","src/file-state/FileStateManager.ts"],"test_files":["src/context-assembler/__tests__/ContextAssembler.test.ts","src/orchestrator/__tests__/HarnessOrchestrator.test.ts","src/orchestrator/phases/__tests__/BootstrapHandler.test.ts","src/orchestrator/phases/__tests__/CascadeBlockedHandler.test.ts","src/orchestrator/phases/__tests__/PhaseAHandler.test.ts","src/orchestrator/phases/__tests__/PhaseBHandler.test.ts","src/orchestrator/phases/__tests__/PhaseFHandler.test.ts","src/orchestrator/phases/__tests__/RefinementHandler.test.ts","src/orchestrator/phases/__tests__/ReviewHandler.test.ts","src/orchestrator/services/__tests__/ProjectStateService.test.ts","src/orchestrator/services/__tests__/ProjectStateService.spec-readiness.test.ts","src/orchestrator/utils/__tests__/GitSensitiveFiles.test.ts","src/orchestrator/utils/__tests__/PhaseFileUtils.test.ts","src/orchestrator/utils/__tests__/PromptHelpers.test.ts","src/validation-gate/__tests__/ValidationGate.test.ts","tests/integration/t11-orchestrator-bootstrap-phasea.test.ts","tests/integration/t12-orchestrator-phaseb.test.ts","tests/integration/t13-orchestrator-phasec.test.ts","tests/unit/phases/t04-phasec-handler.test.ts","tests/unit/phases/t06-phasee-handler.test.ts","tests/unit/t09-reentry-resolver.test.ts","tests/unit/t10-state-machine.test.ts","src/orchestrator/utils/__tests__/PromptTemplate.test.ts","src/file-state/__tests__/DreamingEpisodeStore.test.ts","src/file-state/__tests__/DreamingHandoffs.test.ts","src/file-state/__tests__/DreamingAnalysis.test.ts","src/orchestrator/utils/__tests__/PbbContract.test.ts","src/orchestrator/phases/__tests__/RefinementPublication.test.ts","src/file-state/__tests__/RefinementAtomicWrite.test.ts","tests/unit/phases/t08-refinement-handler.test.ts"],"knowledge":{"schema_version":1,"entities":[{"id":"capability:orchestration-cycle","type":"capability","label":"Orchestration cycle","definition":"Run the project workflow through persisted phases using configured handlers and state.","aliases":[]},{"id":"contract:phase-prompts","type":"contract","label":"Phase prompt templates","definition":"Templates and values rendered for orchestrator agent invocations.","aliases":[]},{"id":"rule:review-policy-block","type":"rule","label":"Review policy block","definition":"A provider refusal prevents review approval and publishing the affected changes.","aliases":[]},{"id":"contract:pbb-refinement","type":"contract","label":"PBB refinement","definition":"Business context with traceable PBI records, evidence and decision status.","aliases":[]}],"claims":[{"id":"claim:orchestrator-phase-chain","subject":"capability:orchestration-cycle","relation":null,"object":null,"statement":"HarnessOrchestrator.run enters the resolved re-entry phase and processes the configured phase chain until the orchestration loop completes.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/orchestrator/HarnessOrchestrator.ts","locator":"run and ReentryResolver.resolve call","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:phase-prompt-rendering","subject":"contract:phase-prompts","relation":null,"object":null,"statement":"Handlers select phase templates and supply values; rendering expands line arrays, performs one-pass substitutions, and fails when a referenced value is absent.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/orchestrator/utils/PromptTemplate.ts","locator":"renderPrompt and loadPrompt","snapshot":null},{"kind":"code","source":"src/orchestrator/phases/PlanningHandler.ts","locator":"buildPlanningPrompt","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:review-policy-block","subject":"capability:orchestration-cycle","relation":"constrained_by","object":"rule:review-policy-block","statement":"When a reviewer reports SAFETY_POLICY_BLOCKED, ReviewFailureService emits a terminal warning, records the refusal, and marks the feature FAILED without scoring or rework. ReviewHandler advances to transition so the next pending feature can go through review. An unresolved block prevents deployment until a subsequent review passes.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/orchestrator/services/ReviewFailureService.ts","locator":"resolveOutputs and failReview","snapshot":null},{"kind":"code","source":"src/orchestrator/phases/ReviewHandler.ts","locator":"handle","snapshot":null},{"kind":"code","source":"src/orchestrator/phases/TransitionHandler.ts","locator":"handle","snapshot":null},{"kind":"code","source":"src/orchestrator/phases/DeployHandler.ts","locator":"reviewPolicyBlockedFeatures guard","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:development-review-handoff","subject":"capability:orchestration-cycle","relation":null,"object":null,"statement":"Development verifies completed TDD output against the active feature and rework count before review. Pending task completion resumes from an accepted episode matching the output and tasks.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/orchestrator/phases/DevelopmentHandler.ts","locator":"handle, canResumeReview and executeChunk","snapshot":null},{"kind":"code","source":"src/orchestrator/utils/PhaseFileUtils.ts","locator":"readCompletedTddOutput","snapshot":null},{"kind":"code","source":"src/file-state/DreamingEpisodeStore.ts","locator":"canResume","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:dreaming-episode-lifecycle","subject":"capability:orchestration-cycle","relation":null,"object":null,"statement":"Review records its disposition and project-scoped evidence before clearing TDD output. After PASS it reviews each owning project with the chronological retry chain, validates the receipt against project records, and leaves incomplete learning pending without changing the verdict. Transition closes the terminal attempt and linked retries.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/orchestrator/phases/ReviewHandler.ts","locator":"handle and recordReview","snapshot":null},{"kind":"code","source":"src/orchestrator/phases/TransitionHandler.ts","locator":"handle calls closeFeature","snapshot":null},{"kind":"code","source":"src/orchestrator/phases/MemoryHandler.ts","locator":"handle supplies and confirms Dreaming handoffs","snapshot":null},{"kind":"code","source":"src/file-state/DreamingAnalysis.ts","locator":"validateDreamingReceipt","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:refinement-staged-publication","subject":"capability:orchestration-cycle","relation":"exposes","object":"contract:pbb-refinement","statement":"Refinement reads agent-written question files and reassesses pending decisions after each answer. It checks a staged REFINEMENT.md against the PBB contract and collected evidence. Validation issues trigger one correction prompt for the same draft. The handler publishes a valid draft or falls back to the original scope and recorded business answers when no valid draft is available. Validation and correction failures allow Bootstrap to proceed.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/orchestrator/phases/RefinementHandler.ts","locator":"handle, consolidateRefinement and readDraft","snapshot":null},{"kind":"code","source":"src/orchestrator/utils/PbbContract.ts","locator":"validatePbbContract","snapshot":null},{"kind":"code","source":"src/file-state/FileStateManager.ts","locator":"saveRefinement","snapshot":null},{"kind":"code","source":"src/orchestrator/prompts/refinement/correction.md","locator":"validation_issues and correction instructions","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:refinement-setup-planning","subject":"contract:pbb-refinement","relation":null,"object":null,"statement":"Refinement records setup answers, authorship and status in QUESTIONS.json. Initial and resumed Planning prompts reload these decisions for applicable projects.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/file-state/FileStateManager.ts","locator":"saveRefinementEvidence and loadSetupDecisions","snapshot":null},{"kind":"code","source":"src/orchestrator/phases/PlanningHandler.ts","locator":"buildSetupDecisionsSection","snapshot":null}],"derived_from":[],"gap":null}]}}
```

# SDK CORE

Implements SDK orchestration as an importable library.

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
├── context-assembler/
│   └── ContextAssembler.ts           # Per-phase payload builders
└── validation-gate/
    └── ValidationGate.ts             # Pure evaluate() function
```
</folder_structure>

## MAIN CONCEPTS

### State Machine Architecture
- **Ports and adapters**: Keep orchestration independent from runners and persistence.
- **State safety**: Use atomic writes and never-throw JSON extraction outcomes.
- **Sessions**: Isolate `{featureId,agent,session,phase}`; resumed prompts cite feature, business context, specs, and projects.
- **Phase prompts**: Templates live under `src/orchestrator/prompts/`, grouped by phase. Handlers supply values and select variants. `PromptTemplate` inserts values in one pass, expands optional line arrays, and reports missing values. The last newline terminates the template file; extra newlines remain in the prompt.
- **Refinement/bootstrap/planning.** Optional PBB refinement precedes Bootstrap for empty backlogs. Each answer informs the next question and can remove a pending one. Enter accepts the recommendation, `/edit` opens a multiline editor, and `/defer` and `/unknown` record unresolved decisions. Bootstrap and Planning carry PBI mappings, commercial order and applicable decisions. Populated backlogs resume at Planning or later.
- **Refinement evidence.** Every human decision and deferral in a new `PBB-Contract: 2` document must match evidence by question ID. References are checked in fields that carry IDs. JSON string notation such as `json:"Line 1\nLine 2"` preserves line breaks in answer fields.
- **Refinement validation.** A proposed priority cites an assumption or provisional model decision. The orchestrator validates the draft against the PBB contract and recorded answers, then requests one correction if needed. Correction reuses the consolidation session when the runner returns one. If no valid draft is available, the orchestrator publishes the original scope and recorded business answers before Bootstrap.
- **Planning business context.** Bootstrap and Planning prefer `REFINEMENT.md` when present and otherwise use `SCOPE.md`. Initial and resumed Planning prompts render the selected source with the same inline or file reference policy. The handler adds the rules for carrying forward business decisions when it selects the refined context.
- **Project setup.** Refinement asks up to four additional setup questions when project evidence shows an initial project or no working implementation. The SDK records setup answers with authorship and status in `QUESTIONS.json` before saving `REFINEMENT.md`. Planning reloads them for both new and continued sessions. Bootstrap invokes `harness-kit:project-memory` once when a configured project lacks `docs/.digest.md` or `docs/.graph.json` and targets only incomplete documentation.
- **Review/transition**: Review or cascade handling must persist a terminal feature status (`COMPLETED`, `BLOCKED`, or `FAILED`) before TRANSITION. TRANSITION rejects non-terminal active features, clears their sessions, and routes the next backlog feature to PLANNING.
- **Resume consistency**: Prefer the configured active feature when rebuilding state so a terminal feature remains available to TRANSITION after a restart.
- **Review policy refusal**: The orchestrator marks the affected feature as `FAILED`, emits a warning in the terminal, and records the refusal in `DECISIONS.md`. The next pending feature follows the normal review flow. Deployment stays paused while a review policy block is unresolved.
- **Review/memory**: Carry compact TDD metrics/files/handoff; verify docs from decisions, final TL/QA, rework, and changed files without process history

## PROJECT DREAMING IN THE PHASE CHAIN

| Phase | Behavior |
|---|---|
| DEVELOPMENT | Initial and retry prompts route each task to its owning project's published RED guidance. When a fresh output for the active feature has a different rework count, Development records the discrepancy in decisions and corrects the count. A valid output must match the active feature and rework count and report success with zero failed tests. A pending refinement decision keeps the task incomplete. The episode preserves project-scoped task, session, changed-file and optional test-decision evidence; unresolvable or ambiguous paths are recorded as source issues. |
| REVIEW | Reviewers form their verdict independently and may return project-relative `learning_evidence`. After PASS, Dreaming receives each owner's chronological attempt chain even without classified findings. The SDK verifies the receipt against project records and preserves incomplete analysis for retry without changing the feature verdict. |
| TRANSITION | A terminal feature closes the current episode and its linked retry attempts. The same runner session can contribute to multiple attempts. |
| MEMORY | Supplies ready publication or withdrawal handoffs to Project Memory. The SDK verifies the routed canonical result before acknowledging the handoff. |

Episodes live under `docs/product/project-dreaming/episodes/` by default; candidate Markdown belongs to the owning project. Episode IDs distinguish attempts even when the runner reuses a session. The receipt and source fingerprint are stored per terminal episode and project. Broken or cyclic chains stay incomplete. The SDK can resume pending task completion from an output that matches an accepted episode and those in-progress tasks. Legacy successful outputs remain usable with already completed tasks.

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
REQUIRED: Invoke `harness-kit:pbb-design` through `harness-kit:cto` during optional REFINEMENT, transition to BOOTSTRAP, and preserve PBB decisions and provisional assumptions in Planning.
ALLOWED: Ask 0â€“12 PBB gap questions; keep `Frontend Screens & Visualization` as an optional evidence-based complement.
PROHIBITED: Mutating state directly without using `IFileStateManager`.
REQUIRED: Tag `DeveloperSessionState` with `phase` to isolate development and review.
REQUIRED: Resume matching retry sessions with `REWORK-LOG.md`; otherwise use a standalone prompt.
REQUIRED: Reuse review sessions on retry; clear feature sessions after transition.
REQUIRED: Run Tech Lead and adversarial QA reviews when validation is enabled, including fast mode.
REQUIRED: Separate typed `readTddOutput` parsing from `summarizeTddOutput` audit formatting.
REQUIRED: In `LOW` planning, request only `003-*` and `004-*`; never generate global `001-*` or `002-*` documents.
REQUIRED: Accept planning only with ordered tasks, non-empty scenarios, and task rows owned by the active feature.
REQUIRED: Validate `TDD-OUTPUT.json` before advancing to REVIEW. Match the active feature and rework count. Keep required refinement or failed tests in development.
REQUIRED: Resume pending task completion from an existing handoff only when the episode identifies the accepted output and those in-progress tasks.
REQUIRED: When review is skipped, record the decision without synthetic Tech Lead or QA scores.
REQUIRED: Summarize completed work and review focus in `TDD-OUTPUT.json.developerHandoff` using at most 500 characters.

## REFERENCES

- [**ARCHITECTURE.md**](../../adr/ARCHITECTURE.md): Architectural decisions like Ports and Adapters.
- [**TESTS.md**](../../adr/TESTS.md): Test documentation.
- [SDK diagnosis](../agents/SDK_DIAGNOSE.md): Post-trace episode processing and handoff queue.
