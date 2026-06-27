| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F001 | T01 | sdk | Initialize `sdk/` project scaffold — create `package.json`, `tsconfig.json`, `tsconfig.build.json`, configure strict mode | sdk_core | - | COMPLETED |
| F001 | T02 | sdk | Define all shared type files — write all `types.ts` files across all modules, no logic | sdk_core | - | COMPLETED |
| F001 | T03 | sdk | Implement `IAgentRunner` stub interface + `NullAgentRunner` class | sdk_core | - | COMPLETED |
| F001 | T04 | sdk | Implement `JsonExtractionProtocol` — four-step extraction algorithm, returns `ExtractionResult` or `ExtractionError` | sdk_core | - | COMPLETED |
| F001 | T05 | sdk | Implement `ValidationGate` — pure function covering all four verdict branches | sdk_core | - | COMPLETED |
| F001 | T06 | sdk | Implement `FileStateManager` parsers — `BacklogParser`, `DevStateParser`, `BootstrapConfigParser` | sdk_core | - | COMPLETED |
| F001 | T07 | sdk | Implement `FileStateManager` class — full `IFileStateManager`, atomic writes, `ensureProductFiles()` | sdk_core | - | COMPLETED |
| F001 | T08 | sdk | Implement `ContextAssembler` — four `build{Phase}Payload` methods with minimal field selection | sdk_core | - | COMPLETED |
| F001 | T09 | sdk | Implement `ReentryResolver` — encode State Transition Table conditions as ordered predicates | sdk_core | - | COMPLETED |
| F001 | T10 | sdk | Implement `StateMachine` — `PhaseTransition[]` table and `next()` function covering all phase transitions | sdk_core | - | COMPLETED |
| F001 | T11 | sdk | Implement `HarnessOrchestrator` — BOOTSTRAP + PHASE_A with FileStateManager and ContextAssembler wired | sdk_core | - | COMPLETED |
| F001 | T12 | sdk | Implement `HarnessOrchestrator` — PHASE_B with task iteration and TDD-OUTPUT.json verification | sdk_core | - | COMPLETED |
| F001 | T13 | sdk | Implement `HarnessOrchestrator` — PHASE_C with parallel dispatch, score extraction, and ValidationGate verdict | sdk_core | - | COMPLETED |
| F001 | T14 | sdk | Implement `HarnessOrchestrator` — PHASE_D + PHASE_E with completion check and memory persistence | sdk_core | - | COMPLETED |
| F001 | T15 | sdk | Implement `src/index.ts` — export public API, validate clean build with zero TypeScript errors | sdk_core | - | COMPLETED |
| F002 | T01 | sdk | Add `DecisionEntry` interface to `sdk/src/file-state/types.ts` and update `IFileStateManager.appendDecision` signature from `(text: string)` to `(entry: DecisionEntry)` | sdk_state | VALIDATION | COMPLETED |
| F002 | T02 | sdk | Write failing tests for updated `appendDecision(entry: DecisionEntry)`: row format, null featureId renders as GLOBAL, scores formatted, missing optional fields render as `-`, atomic write | sdk_state | VALIDATION | COMPLETED |
| F002 | T03 | sdk | Implement `appendDecision(entry: DecisionEntry)` in `FileStateManager.ts`: format entry as markdown table row, write atomically; make T02 tests pass | sdk_state | VALIDATION | COMPLETED |
| F002 | T04 | sdk | Add `updateFeatureStatus` to `IFileStateManager` and write failing tests: status updated, scores updated when provided, scores unchanged when omitted, throws on missing featureId, idempotency | sdk_state | VALIDATION | COMPLETED |
| F002 | T05 | sdk | Implement `updateFeatureStatus` in `FileStateManager.ts`: replace `saveFeatureStatus` with `updateFeatureStatus`; make T04 tests pass | sdk_state | VALIDATION | COMPLETED |
| F002 | T06 | sdk | Add `incrementReworks` to `IFileStateManager` and write failing tests: increments by 1, two sequential calls produce Reworks+2, treats empty/non-numeric as 0, throws on missing featureId | sdk_state | VALIDATION | COMPLETED |
| F002 | T07 | sdk | Implement `incrementReworks` in `FileStateManager.ts`: rename/alias `incrementFeatureReworks` to `incrementReworks`; make T06 tests pass | sdk_state | VALIDATION | COMPLETED |
| F002 | T08 | sdk | Add `resetTasksForRetry` to `IFileStateManager` and write failing tests: all tasks reset to IMPLEMENTATION/NOT_STARTED, other features unchanged, idempotency, no-op when zero tasks, COMPLETED tasks also reset | sdk_state | VALIDATION | COMPLETED |
| F002 | T09 | sdk | Implement `resetTasksForRetry` in `FileStateManager.ts`: call `this.updateAllFeatureTasks(featureId, 'IMPLEMENTATION', 'NOT_STARTED')`; make T08 tests pass | sdk_state | VALIDATION | COMPLETED |
| F002 | T10 | sdk | Add `getExecutableFeatures` to `IFileStateManager` and write failing tests: NOT_STARTED with all deps COMPLETED returned, BLOCKED/IN_PROGRESS deps excluded, empty deps included, IN_PROGRESS feature excluded, empty backlog returns [], all terminal returns [] | sdk_state | VALIDATION | COMPLETED |
| F002 | T11 | sdk | Implement `getExecutableFeatures` in `FileStateManager.ts`: load backlog, build COMPLETED IDs set, filter by NOT_STARTED and all deps in set; make T10 tests pass | sdk_state | VALIDATION | COMPLETED |
| F002 | T12 | sdk | Add `getNextTask` to `IFileStateManager` and write failing tests: returns first NOT_STARTED task in table order, null when all COMPLETED, null when no tasks, skips COMPLETED/IN_PROGRESS, table order preserved | sdk_state | VALIDATION | COMPLETED |
| F002 | T13 | sdk | Implement `getNextTask` in `FileStateManager.ts`: load dev state, filter by featureId and NOT_STARTED, return tasks[0] ?? null; make T12 tests pass | sdk_state | VALIDATION | COMPLETED |
| F002 | T14 | sdk | Update `sdk/src/index.ts` to export `DecisionEntry`; verify all new methods accessible through `IFileStateManager`; run `tsc --noEmit` and confirm zero TypeScript errors | sdk_state | VALIDATION | COMPLETED |
| F003 | T01 | sdk | Define AgentRunnerConfig interface + DEFAULT_AGENT_RUNNER_CONFIG constant + Object.freeze merge helper | sdk_agent_runner | IMPLEMENTATION | IN_PROGRESS |
| F003 | T02 | sdk | Define AgentRunnerErrorCode enum + AgentRunnerError class with all four fields | sdk_agent_runner | IMPLEMENTATION | IN_PROGRESS |
| F003 | T03 | sdk | ClaudeAgentRunner constructor — reads ANTHROPIC_API_KEY, throws AgentRunnerError(MISSING_API_KEY) when absent, stores frozen config and Anthropic client | sdk_agent_runner | IMPLEMENTATION | IN_PROGRESS |
| F003 | T04 | sdk | ClaudeAgentRunner.run() happy path — mock Anthropic client returns single text block, rawOutput collected, AgentOutput.raw matches | sdk_agent_runner | IMPLEMENTATION | IN_PROGRESS |
| F003 | T05 | sdk | JSON extraction — markdown fences case: rawOutput contains ```json block, extractedJson parsed correctly | sdk_agent_runner | IMPLEMENTATION | IN_PROGRESS |
| F003 | T06 | sdk | JSON extraction — bare JSON case: rawOutput contains raw JSON object without fences, extractedJson parsed correctly | sdk_agent_runner | IMPLEMENTATION | IN_PROGRESS |
| F003 | T07 | sdk | JSON extraction — no JSON case: rawOutput is plain prose, extractedJson = null | sdk_agent_runner | IMPLEMENTATION | IN_PROGRESS |
| F003 | T08 | sdk | Timeout enforcement — AbortController fires after timeoutMs, request is aborted, AgentRunnerError(TIMEOUT) thrown with skill and phase set | sdk_agent_runner | IMPLEMENTATION | IN_PROGRESS |
| F003 | T09 | sdk | API error 4xx/5xx — mock Anthropic throws APIStatusError, caught and wrapped as AgentRunnerError(API_ERROR) with cause set | sdk_agent_runner | IMPLEMENTATION | IN_PROGRESS |
| F003 | T10 | sdk | Network failure — mock Anthropic throws APIConnectionError, caught and wrapped as AgentRunnerError(NETWORK_ERROR) with cause set | sdk_agent_runner | IMPLEMENTATION | IN_PROGRESS |
| F003 | T11 | sdk | Custom model config — constructor accepts Partial<AgentRunnerConfig> with model override, messages.create called with that model | sdk_agent_runner | IMPLEMENTATION | IN_PROGRESS |
| F003 | T12 | sdk | Empty response — API returns content blocks where all text is empty string, rawOutput = "", extractedJson = null, AgentOutput returned without error | sdk_agent_runner | IMPLEMENTATION | IN_PROGRESS |
| F003 | T13 | sdk | Large response — API returns 100 KB text block, rawOutput.length > 50000, no truncation applied, AgentOutput.raw matches full string | sdk_agent_runner | IMPLEMENTATION | IN_PROGRESS |
| F003 | T14 | sdk | Export ClaudeAgentRunner, AgentRunnerError, AgentRunnerErrorCode, AgentRunnerConfig from sdk/src/index.ts; run tsc --noEmit; verify zero errors | sdk_agent_runner | IMPLEMENTATION | IN_PROGRESS |
| F004 | T01 | sdk | Read sdk/tsconfig.build.json and verify it sets rootDir: "src", outDir: "dist", excludes tests/, and inherits declaration/declarationMap/sourceMap from tsconfig.json. If all values are correct, make no changes. If any value is missing or wrong, update to match 003 Section 3. | sdk_package | IMPLEMENTATION | NOT_STARTED |
| F004 | T02 | sdk | Update sdk/package.json: set version to "1.0.0", add license: "MIT", expand description, add exports map (. → CJS only), add files: ["dist","README.md"], add prepublishOnly: "npm run build && npm test" script. Preserve all existing fields verbatim unless listed above. | sdk_package | IMPLEMENTATION | NOT_STARTED |
| F004 | T03 | sdk | Run npm run build from sdk/ and confirm exit code 0. Confirm dist/index.js, dist/index.d.ts, dist/index.js.map, dist/index.d.ts.map all exist after the build. | sdk_package | IMPLEMENTATION | NOT_STARTED |
| F004 | T04 | sdk | Run npm run typecheck from sdk/ and confirm zero TypeScript errors. Validates that public API types in src/index.ts round-trip correctly. | sdk_package | IMPLEMENTATION | NOT_STARTED |
| F004 | T05 | sdk | Run npm pack --dry-run from sdk/ and verify file list: dist/ and README.md included; src/, tests/, tsconfig*.json, docs/, node_modules/ excluded. If list diverges, adjust files in package.json and re-run. | sdk_package | IMPLEMENTATION | NOT_STARTED |
| F004 | T06 | sdk | Run npm test from sdk/ and confirm all Vitest tests pass with exit code 0 (225 tests must pass, 0 failures). | sdk_package | IMPLEMENTATION | NOT_STARTED |
| F004 | T07 | sdk | Write sdk/README.md with: package name + one-sentence description, npm install harness-kit-sdk, HarnessOrchestrator usage example with OrchestratorConfig construction and run() call, ANTHROPIC_API_KEY env var note, brief note on injecting custom IAgentRunner for testing. | sdk_package | IMPLEMENTATION | NOT_STARTED |
| F004 | T08 | sdk | Simulate prepublishOnly by running npm run build && npm test sequentially from sdk/. Both must exit code 0. Confirm build runs first, test second. | sdk_package | IMPLEMENTATION | NOT_STARTED |
