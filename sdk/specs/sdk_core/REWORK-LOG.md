# REWORK LOG — sdk_core F001 — Rework #1

## Verdict: RETRY
- Score TL: 0.81 (threshold 0.70 — PASS)
- Score Adv: 0.52 (threshold 0.70 — FAIL)
- hasHighCriticalVuln: true
- isCrashing: true
- Reworks used: 1 / 2

---

## Open Points (the-grumpy-tech-lead)

1. `HarnessOrchestrator.runPhaseC()` hardcodes `isCrashing=false` and `hasHighCriticalVuln=false` when calling `ValidationGate.evaluate()`. The adversarial-qa agent output fields `hasHighCriticalVuln` and `isCrashing` are never extracted, making the BLOCK verdict path unreachable at runtime. Test TS-F-03 uses `toMatch(/FAILED|BLOCKED/)` loose assertion masking this defect.

2. `runPhaseB()` marks a task COMPLETED in both branches of the TDD-OUTPUT.json existence check — if/else do the same thing. The guard for missing TDD-OUTPUT is dead code.

3. `persistPhase()` does a load/save of BootstrapConfig but never writes `currentPhase` into it. Spec Section 4.2 requires "Persist currentPhase to BOOTSTRAP-CONFIG.json before executing" — this contract is silently broken with no covering test.

4. `runPhaseE()` passes `decisions=[]` (hardcoded empty array) to `ContextAssembler.buildPhaseEPayload()`. The spec requires `recentDecisions` to be loaded from DECISIONS.md — loading never happens, the field is always empty.

5. `OnDiskState` is exported from `src/index.ts` as public API. It is an internal orchestrator snapshot type and should not be part of the public surface.

6. TS-F-01 sub-assertion "DECISIONS.md contains acceptance log entry" is not verified in any test.

7. TS-U-01 "sixth value causes compile error" verified only at runtime via array length check, not a `@ts-expect-error` type-level guard.

8. TS-F-01 does not directly read and assert DEVELOPMENT-STATE.md task statuses after run() completes.

---

## Edge Cases Missed (adversarial-qa)

1. **PATH TRAVERSAL (CRITICAL)**: `writeReworkLog` passes the `domain` parameter directly to `path.join` without sanitization. A `domain = '../../etc'` value escapes the working directory tree. Must validate domain does not contain `..` or absolute path segments.

2. **BLOCK verdict is dead code (HIGH)**: `isCrashing` and `hasHighCriticalVuln` are hardcoded to `false` in `runPhaseC`. The BLOCK verdict path is structurally unreachable through the real `run()` loop. Must extract these fields from adversarial-qa `AgentOutput.raw` using `JsonExtractionProtocol`.

3. **runPhaseB silent false-completion (HIGH)**: Both branches of the `if (existsSync(tddOutputPath))` check mark the task COMPLETED. A failed TDD agent run that produces no TDD-OUTPUT.json still silently marks the task complete. Must throw or halt when TDD-OUTPUT.json is absent after agent invocation.

4. **Non-null assertions on `activeFeature!` (MEDIUM)**: In `dispatch()`, PHASE_B, PHASE_C, PHASE_E branches use `activeFeature!`. Re-entry into these phases with no active feature passes `undefined` as `Feature` at runtime bypassing TypeScript safety.

5. **Silent no-ops on missing IDs (MEDIUM)**: `saveFeatureStatus` and `incrementFeatureReworks` silently succeed when the ID is not found — orchestrator state diverges from disk with no error raised.

6. **`updateTaskStatus` cross-feature ID collision (MEDIUM)**: Matches by `taskId` only, no `featureId` scope — two features sharing a taskId string (e.g. T01) cause cross-feature row corruption.

7. **BootstrapConfigParser throws on corrupted JSON (MEDIUM)**: Called without error guard in `runPhaseC` and `runPhaseE` — an unhandled rejection propagates out of `run()`. Only `persistPhase` silently swallows it.

8. **atomicWrite temp file on crash (LOW)**: `.tmp` file persisted if process crashes between `writeFileSync` and `renameSync`. Cross-device rename failure is unhandled.

9. **TS-F-03 BLOCK path acknowledged untestable**: Test asserts `/FAILED|BLOCKED/` — accepts FAIL when BLOCK was intended.

10. **Empty backlog re-entry boundary not covered**: 0 features with product files present and phase persisted as PHASE_B/C — no test covers this re-entry path.

---

## Required Fixes for Rework #1

### CRITICAL (must fix before Phase C re-run)

- Fix path traversal in `writeReworkLog`: validate domain contains only alphanumeric, `_`, `-` characters
- Fix `runPhaseC`: extract `hasHighCriticalVuln` and `isCrashing` from adversarial-qa `AgentOutput.raw` using `JsonExtractionProtocol` before calling `ValidationGate.evaluate()`
- Fix `runPhaseB`: throw or return error state when TDD-OUTPUT.json is absent after agent invocation

### HIGH (must fix before Phase C re-run)

- Fix `persistPhase`: actually write `currentPhase` into BOOTSTRAP-CONFIG.json
- Fix `runPhaseE`: load recent decisions from DECISIONS.md, pass to `buildPhaseEPayload`
- Fix `updateTaskStatus`: add `featureId` parameter to scope updates to single feature
- Add error throw when `saveFeatureStatus` / `incrementFeatureReworks` ID not found

### MEDIUM (fix or accept with documented rationale)

- Remove `OnDiskState` from `src/index.ts` public exports
- Fix non-null assertions on `activeFeature!` with proper null guard and explicit error
- Add TS-F-01 assertion for DECISIONS.md acceptance log entry
- Fix TS-F-03 test to assert specifically BLOCKED status (not loose regex)
