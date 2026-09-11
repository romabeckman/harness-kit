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

Run agentic acceptance outside development orchestration, with LLM-planned scenarios, visible terminal progress, real runtime evidence, and one final report.

```graph
{
  "node_id": "feature:qa_tester",
  "domain": "qa",
  "implements": ["adr:architecture"],
  "tested_by": ["adr:tests"],
  "entrypoints": ["src/qa/QaAgenticOrchestrator.ts", "src/cli/services/qa-service.ts"],
  "registration_files": ["src/cli/run.ts", "src/cli/utils/constants.ts", "src/index.ts", "src/qa/index.ts"],
  "reference_files": ["src/qa/CurlDriver.ts"],
  "code_files": ["src/qa/QaService.ts", "src/qa/QaRuntimeManager.ts", "src/qa/QaTargetProbe.ts", "src/qa/types.ts", "src/qa/progress.ts", "src/qa/QaRunStore.ts", "src/qa/QaVerdictPolicy.ts", "src/qa/PlaywrightDriver.ts", "src/qa/ui/QaTerminalView.ts", "src/qa/phases/types.ts", "src/qa/phases/QaPlanningPhase.ts", "src/qa/phases/QaExecutionPhase.ts", "src/qa/phases/QaReportingPhase.ts", "src/qa/phases/index.ts"],
  "test_files": ["src/qa/__tests__/QaAgenticOrchestrator.test.ts", "src/qa/__tests__/QaService.test.ts", "src/qa/__tests__/QaRunStore.test.ts", "src/qa/ui/__tests__/QaTerminalView.test.ts", "src/cli/services/__tests__/qa-service.test.ts"]
}
```

## OVERVIEW

Use `QaAgenticOrchestrator` independently of backlog, development session, and review score. Accept an open scope or optional detailed scenarios, and emit typed progress events without coupling orchestration to terminal output. Persist plans under `.harness-kit/qa/plans/`; persist run state, evidence, and `report.json` under `.harness-kit/qa/runs/` through atomic replacement.

## FOLDER STRUCTURE

<folder_structure>
```text
src/qa/                     # agentic orchestration, plans, reports, and drivers
|-- phases/                 # planning, execution, and reporting handlers
|-- ui/                     # QA-specific terminal presenter
`-- QaAgenticOrchestrator.ts
src/cli/services/            # `hrns qa` command adapter
```
</folder_structure>

## EXECUTION

1. **Supply scope or scenarios** with `hrns qa`.
2. **Prepare the runtime**: honor an explicit target or serve a root `index.html` on an OS-assigned loopback port.
3. **Plan agentically**: inspect the project, preserve supplied scenario intent, add missing coverage, and use the prepared target.
4. **Probe once** before scenario execution and block the run without invoking drivers when the target is unavailable.
5. **Execute deterministically**: use real `curl` or Playwright actions selected by the plan.
6. **Report agentically**: synthesize bugs and errors while deriving verdict and criterion status from runtime results.
7. **Stop managed runtimes** after success or failure, then persist the final report and audit artifacts.

```text
# CORRECT: provide open scope; let LLM generate executable scenarios
hrns qa --scope "Test order creation endpoint" --target http://127.0.0.1:3000

# CORRECT: provide optional baseline scenarios; let LLM add gaps
hrns qa --scope "Validate checkout" --scenario "Valid payment succeeds" --profile web

# WRONG: use development validation as runtime acceptance
hrns run --skip-validation
```

## VERDICTS

| Verdict | Condition |
| --- | --- |
| PASS | Every required scenario passed with evidence. |
| FAIL | A required assertion demonstrably failed. |
| BLOCKED | A required scenario cannot execute. |
| INCONCLUSIVE | Required coverage, evidence, or results are insufficient. |

## TERMINAL PROGRESS

| Event | Terminal output |
| --- | --- |
| `runtime_ready` | Resolved target and whether the CLI started a temporary static server. |
| `phase_started` | Current planning, execution, or reporting phase. |
| `scenario_started` | Scenario position and human-readable action. |
| `scenario_completed` | Deterministic runtime status for the scenario. |
| `phase_completed` | Planned count, runtime verdict, or report readiness. |

REQUIRED: Emit progress through `QaProgressListener`; keep orchestrator and drivers independent from ANSI output. REQUIRED: Inject `QaTerminalPresenter` at the CLI boundary. REQUIRED: Disable ANSI styles automatically when stdout is not a TTY.

## DRIVERS

`QaRuntimeManager` owns temporary static servers and cleanup. It binds `127.0.0.1` to port `0`, allowing the operating system to select a collision-free port, and makes that URL authoritative over guessed planner origins. `QaService` probes the target once before dispatching any driver; one unavailable target produces blocked scenarios and one deduplicated report error.

`QaPlanningPhase` invokes the configured agent runner and validates its plan before execution. `CurlDriver` invokes real `curl`/`curl.exe`; `PlaywrightDriver` launches Chromium and performs declared human actions. `QaReportingPhase` invokes the LLM again, then reconciles its narrative with deterministic scenario results so failed or blocked checks cannot become `PASS`.

Run this once after dependency changes:

```text
rtk npm install
rtk npx playwright install chromium
```

## LIMITS

REQUIRED: Supply `--scope` or at least one `--scenario`. ALLOWED: Omit scenarios; the planning LLM derives them from scope and project inspection. ALLOWED: Supply scenarios; the LLM preserves their intent and adds coverage gaps. PROHIBITED: Treat LLM prose as verdict truth; runtime results own verdict and criterion status. Runtime acceptance starts root static sites automatically, but does not yet start arbitrary framework or API processes, gate development `REVIEW`/`TRANSITION`, retain traces/video, or support native games.

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
