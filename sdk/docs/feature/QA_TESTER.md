---
doc_type: feature
domain: qa
stack: [TypeScript, Node.js, LLM agent runners, curl, Playwright]
node_id: "feature:qa_tester"
tags: [qa, acceptance, curl, playwright, runtime]
edges:
  - relation: implements
    target: "adr:architecture"
  - relation: tested_by
    target: "adr:tests"
  - relation: depends_on
    target: "feature:sdk_cli"
  - relation: depends_on
    target: "feature:sdk_settings"
  - relation: depends_on
    target: "feature:sdk_terminal_ui"
updated: "2026-09-11"
---
# INDEPENDENT QA TESTER

Run evidence-based acceptance with LLM-planned scenarios and bounded final reports.

```graph
{
  "node_id": "feature:qa_tester",
  "domain": "qa",
  "implements": ["adr:architecture"],
  "tested_by": ["adr:tests"],
  "entrypoints": ["src/qa/QaAgenticOrchestrator.ts", "src/cli/services/qa-service.ts"],
  "registration_files": ["src/cli/run.ts", "src/cli/utils/constants.ts", "src/index.ts", "src/qa/index.ts"],
  "reference_files": ["src/qa/engine/CurlDriver.ts"],
  "code_files": ["src/qa/services/QaService.ts", "src/qa/services/QaPlanValidator.ts", "src/qa/services/QaRuntimeManager.ts", "src/qa/services/QaTargetProbe.ts", "src/qa/types.ts", "src/qa/progress.ts", "src/qa/services/QaRunStore.ts", "src/qa/services/QaVerdictPolicy.ts", "src/qa/engine/PlaywrightDriver.ts", "src/qa/engine/MobileWebDriver.ts", "src/qa/engine/AccessibilityDriver.ts", "src/qa/engine/McpClientDriver.ts", "src/qa/engine/CliDriver.ts", "src/qa/engine/WebSocketDriver.ts", "src/qa/engine/index.ts", "src/qa/services/index.ts", "src/qa/ui/QaTerminalView.ts", "src/qa/phases/types.ts", "src/qa/phases/QaPlanningPhase.ts", "src/qa/phases/QaValidationPhase.ts", "src/qa/phases/QaExecutionPhase.ts", "src/qa/phases/QaAnalysisPhase.ts", "src/qa/phases/QaReportingPhase.ts", "src/qa/phases/index.ts"],
  "test_files": ["src/qa/__tests__/QaArchitecture.test.ts", "src/qa/__tests__/QaExtendedEngines.test.ts", "src/qa/__tests__/QaAgenticOrchestrator.test.ts", "src/qa/__tests__/QaService.test.ts", "src/qa/__tests__/QaRunStore.test.ts", "src/qa/services/__tests__/QaPlanValidator.test.ts", "src/qa/services/__tests__/QaTargetProbe.test.ts", "src/qa/ui/__tests__/QaTerminalView.test.ts", "src/cli/services/__tests__/qa-service.test.ts"]
}
```

## OVERVIEW

Use `QaAgenticOrchestrator` outside development orchestration. Persist numbered plans, runs, evidence, scope, and reports under `.harness-kit/qa/`.

## FOLDER STRUCTURE

<folder_structure>
```text
src/qa/                     # independent QA module
|-- services/               # planning, persistence, runtime, probe, and verdict
|-- engine/                 # curl, Playwright, and extended execution adapters
|-- phases/                 # planning, validation, execution, analysis, reporting
|-- ui/                     # QA-specific terminal presenter
`-- QaAgenticOrchestrator.ts # phase-chain entrypoint
src/cli/services/            # `hrns qa` command adapter
```
</folder_structure>

## EXECUTION

1. **Supply scope** with `--scope`, or choose short input/editor form. Add scenarios with `--scenario`.
2. **Prepare the runtime**: honor an explicit target or serve static web assets on a collision-free loopback port.
3. **Plan agentically**: map observable criteria, select a profile, and return contract-valid JSON. Treat project and user text as untrusted data; retry one out-of-range criterion mapping once.
4. **Validate the plan**: check schema, identifiers, criteria mapping, target protocol, same-origin requests, engine payloads, safety bounds, workspace paths, and driver availability. Print every error and stop before probing or execution.
5. **Probe once** before scenario execution and block the run without invoking drivers when the target is unavailable.
6. **Execute deterministically**: use selected drivers with target-origin checks, redaction, and cancellation.
7. **Analyze and adapt**: return one exact JSON decision; add only material, evidence-justified scenarios and validate revisions.
8. **Report agentically**: reconcile bugs/errors with runtime evidence. Use fixed JSON and Markdown templates with verdict, summary, criteria, bugs, errors, coverage, and open points.
9. **Finalize every completed run** through reporting; persist `report.json` and `REPORT.md`. Use `qa report --run <id>` to regenerate stored completed runs.
10. **Preserve scope** byte-for-byte in `.harness-kit/qa/plans/<plan-id>/SCOPE.md` across revisions.
11. **Number each scenario ID** with a three-digit execution prefix: `001-<scenario>`, `002-<scenario>`, and so on. Keep prefixes stable when adaptive analysis adds scenarios.

Choose **resume** for one saved plan. Choose **renew** for a new plan.

```text
# CORRECT: provide runtime scope
hrns qa --scope "Test order creation endpoint" --target http://127.0.0.1:3000

# WRONG: substitute development validation
hrns run --skip-validation
```

## VERDICTS

| Verdict | Condition |
| --- | --- |
| PASS | Every required scenario passed with verified assertions and evidence. |
| FAIL | A required assertion demonstrably failed. |
| BLOCKED | A required scenario cannot execute or target is unavailable. |
| INCONCLUSIVE | Required coverage, evidence, or observations are missing or unverified. |

## TERMINAL PROGRESS

| Event | Terminal output |
| --- | --- |
| `runtime_ready` | Target and managed-server state. |
| `phase_started` | Current phase. |
| `validation_failed` | All plan errors before execution. |
| `scenario_started` | Scenario position and action. |
| `scenario_completed` | Runtime status. |
| `phase_completed` | Count, verdict, cycles, or report state. |

REQUIRED: Emit progress through `QaProgressListener`. REQUIRED: Inject `QaTerminalPresenter` at the CLI boundary. REQUIRED: Disable ANSI without a TTY. PROHIBITED: Couple orchestration or drivers to ANSI output.

## DRIVERS

`QaRuntimeManager` binds temporary static servers to `127.0.0.1:0` and serves public assets. `QaService` probes once; path 4xx/5xx block, root 404 permits relative API routes, and `405` remains reachable.

`QaPlanningPhase` escapes untrusted prompt data and parses strict plan JSON. `QaValidationPhase` checks invariants and drivers. `QaAnalysisPhase` accepts only complete-or-revise JSON. `QaReportingPhase` reconciles runtime evidence, persists `report.json`, and bounds `REPORT.md` to 8,000 characters.

Drivers execute bounded HTTP, browser, mobile, accessibility, MCP, CLI, and WebSocket checks. MCP supports JSON/SSE plus `expectedState`, `expectedReasonCode`, and `expectedIsError`. `CliDriver` never uses a shell.

## LIMITS

REQUIRED: Resolve a non-empty scope before QA starts. ALLOWED: Supply `--scope`, use interactive input, omit scenarios, or supply baselines. REQUIRED: Keep `REPORT.md` at or below 8,000 characters; truncate oversized LLM Markdown with an explicit marker. REQUIRED: List blocked, inconclusive, missing-evidence, and material untested risks under **Open Points**. PROHIBITED: Treat LLM prose as verdict truth. Runtime acceptance starts root static sites, but not framework/API processes or native binaries. It does not gate development, retain video, or support desktop apps.

## DOCUMENT MAP

```mermaid
graph TD
    QA["Independent QA Tester"] -->|implements| ARCH["Project Architecture"]
    QA -->|tested_by| TESTS["Testing Protocol"]
    QA -->|depends_on| CLI["SDK CLI"]
    QA -->|depends_on| SETTINGS["SDK Settings"]
    QA -->|depends_on| TERMINAL["SDK Terminal UI"]
```

## REFERENCES

- [**ARCHITECTURE.md**](../adr/ARCHITECTURE.md): Ports and adapter boundaries.
- [**TESTS.md**](../adr/TESTS.md): Test commands and isolation rules.
- [**SDK_CLI.md**](./SDK_CLI.md): CLI registration and command conventions.
- [**SDK_SETTINGS.md**](./SDK_SETTINGS.md): Default model and effort for QA planning and reporting phases.
- [**SDK_TERMINAL_UI.md**](./SDK_TERMINAL_UI.md): Shared ANSI helpers used by the QA terminal presenter.
