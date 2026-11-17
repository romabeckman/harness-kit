---
doc_type: feature
domain: qa
stack: [TypeScript, Node.js, Vitest 5.0.3, LLM agent runners, Playwright]
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
updated: 2026-11-16
---
```graph
{"node_id":"feature:qa_tester","domain":"qa","implements":["adr:architecture"],"tested_by":["adr:tests"],"entrypoints":["src/qa/QaAgenticOrchestrator.ts","src/cli/services/qa-service.ts","src/cli/services/run-service.ts"],"registration_files":["src/cli/run.ts","src/cli/utils/constants.ts","src/cli/services/qa/QaOrchestratorFactory.ts","src/index.ts","src/qa/index.ts"],"reference_files":["src/qa/engine/CurlDriver.ts","src/qa/auth/QaAuthConfigStore.ts","src/qa/auth/types.ts","src/cli/services/qa/QaAuthCommand.ts"],"code_files":["src/cli/utils/run-args-parser.ts","src/cli/services/qa/types.ts","src/cli/services/qa/QaArgsParser.ts","src/cli/services/qa/QaDevelopmentRenewal.ts","src/cli/services/qa/QaExploratoryCommand.ts","src/cli/services/qa/QaReportOutput.ts","src/qa/services/QaService.ts","src/qa/services/QaDeveloperReportGenerator.ts","src/qa/services/QaExploratoryService.ts","src/qa/services/QaExecutionMemory.ts","src/qa/services/QaPlanValidator.ts","src/qa/services/QaRuntimeManager.ts","src/qa/services/QaTargetProbe.ts","src/qa/types.ts","src/qa/progress.ts","src/qa/services/QaRunStore.ts","src/qa/services/QaVerdictPolicy.ts","src/qa/engine/PlaywrightDriver.ts","src/qa/engine/MobileWebDriver.ts","src/qa/engine/AccessibilityDriver.ts","src/qa/engine/McpClientDriver.ts","src/qa/engine/CliDriver.ts","src/qa/engine/WebSocketDriver.ts","src/qa/engine/QaAuthRedaction.ts","src/qa/engine/index.ts","src/qa/services/index.ts","src/qa/ui/QaTerminalView.ts","src/qa/utils/QaAgentFileOutput.ts","src/qa/utils/QaPlanRetargeting.ts","src/qa/phases/types.ts","src/qa/phases/QaPlanningPhase.ts","src/qa/phases/QaValidationPhase.ts","src/qa/phases/QaExecutionPhase.ts","src/qa/phases/QaAnalysisPhase.ts","src/qa/phases/QaReportingPhase.ts","src/qa/phases/index.ts"],"test_files":["src/qa/__tests__/PlaywrightDriverIsolation.test.ts","src/qa/auth/__tests__/QaAuthConfigStore.test.ts","src/qa/auth/__tests__/QaAuthExecution.test.ts","src/qa/__tests__/QaArchitecture.test.ts","src/qa/__tests__/QaExtendedEngines.test.ts","src/qa/__tests__/QaAuthEngineSecurity.test.ts","src/qa/__tests__/QaAgenticOrchestrator.test.ts","src/qa/__tests__/QaService.test.ts","src/qa/__tests__/QaImprovements.test.ts","src/qa/__tests__/QaCurlRegressions.test.ts","src/qa/__tests__/QaRunStore.test.ts","src/qa/__tests__/QaReviewRegressions.test.ts","src/qa/services/__tests__/QaPlanValidator.test.ts","src/qa/services/__tests__/QaTargetProbe.test.ts","src/qa/ui/__tests__/QaTerminalView.test.ts","src/cli/services/__tests__/qa-service.test.ts","src/cli/services/__tests__/run-service.test.ts","src/cli/utils/__tests__/run-args-parser.test.ts","src/qa/__tests__/QaExecutionReliability.test.ts","tests/integration/qa-browser-runtime.test.ts"],"knowledge":{"schema_version":1,"entities":[{"id":"capability:agentic-qa-execution","type":"capability","label":"Agentic QA execution","definition":"Plan, validate, execute, analyze, and report runtime QA scenarios.","aliases":[]},{"id":"rule:qa-adaptive-analysis","type":"rule","label":"Adaptive analysis opt-in","definition":"Adaptive QA analysis is disabled unless explicitly enabled.","aliases":[]},{"id":"rule:qa-result-completeness","type":"rule","label":"Complete required runtime results","definition":"A passing verdict requires an observed result with evidence for every required planned scenario.","aliases":[]},{"id":"decision:qa-chromium-header-auth","type":"decision","label":"Per-hop Chromium header authentication","definition":"Bearer and API-key profiles use Chromium Fetch interception to scope credentials to the target origin on every hop.","aliases":[]}],"claims":[{"id":"claim:qa-phase-pipeline","subject":"capability:agentic-qa-execution","relation":null,"object":null,"statement":"QaAgenticOrchestrator defaults to planning, validation, execution, analysis, and reporting handlers; report generation defaults on and adaptive analysis defaults off.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/qa/QaAgenticOrchestrator.ts","locator":"constructor default phase handlers and reportEnabled/analysisEnabled initialization","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:qa-analysis-opt-in","subject":"capability:agentic-qa-execution","relation":"constrained_by","object":"rule:qa-adaptive-analysis","statement":"QaAgenticOrchestrator sets analysisEnabled to options.analysis ?? false.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/qa/QaAgenticOrchestrator.ts","locator":"constructor: analysisEnabled initialization","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:qa-required-result-completeness","subject":"capability:agentic-qa-execution","relation":"constrained_by","object":"rule:qa-result-completeness","statement":"QaService reconciles required plan scenarios before finalization, converts driver execution exceptions into BLOCKED results, and invalidates prior completion before continuation.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/qa/services/QaService.ts","locator":"continue, finalize, executeDriver","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:qa-per-hop-header-auth","subject":"capability:agentic-qa-execution","relation":"governed_by","object":"decision:qa-chromium-header-auth","statement":"Bearer and API-key browser contexts block service workers and use Chromium Fetch interception to inject credentials only on target-origin hops, stripping inherited configured headers on other origins.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/qa/engine/PlaywrightDriver.ts","locator":"execute browser context options; applyBrowserAuth Fetch.requestPaused handler","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:qa-browser-observation-deadlines","subject":"capability:agentic-qa-execution","relation":null,"object":null,"statement":"Browser locator reads receive the remaining three-second assertion budget and cancellation signal; fixed browser waits use a signal-aware timer.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/qa/engine/PlaywrightDriver.ts","locator":"inspect, inspectAssertion, perform wait branch","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:qa-browser-launch-prerequisite","subject":"capability:agentic-qa-execution","relation":null,"object":null,"statement":"Browser doctor verifies launch and cleanup, reporting unavailable when the module or browser cannot be used.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/qa/engine/PlaywrightDriver.ts","locator":"doctor","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:qa-retargeted-references","subject":"capability:agentic-qa-execution","relation":null,"object":null,"statement":"Target overrides rebase same-origin navigation, URL waits, URL assertions, and absolute HTTP URLs while preserving relative HTTP paths and foreign URLs in a copied plan.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/qa/utils/QaPlanRetargeting.ts","locator":"retargetQaPlan","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:qa-cli-deadline-cause","subject":"capability:agentic-qa-execution","relation":null,"object":null,"statement":"CLI timeout records its stop reason before killing the child; close handling preserves that cause and the driver reports BLOCKED.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/qa/engine/CliDriver.ts","locator":"executeCommand stop and finish; execute catch","snapshot":null}],"derived_from":[],"gap":null}]}}
```

# INDEPENDENT QA TESTER

## OVERVIEW

Persist QA plans, runs, evidence, and reports in `docs/qa/`.

## EXECUTION

1. **Run** `hrns qa run`; choose resume, analysis, or new when plans exist.
2. **Define** scope with `--scope`; repeat `--scenario` for baselines.
3. **Validate** plan, target, profile, scenarios, and driver prerequisites; correct plan-contract errors once, then block invalid requests.
4. **Execute** in order; use `--analysis` for evidence analysis.
5. **Report** with `hrns qa report --run <id>`; explore with `qa exploratory`.
6. **Authenticate** with `--auth <profile>`; planning receives safe profile metadata and browser execution applies the selected credentials.

Each supplied `--scenario` is mandatory. Preserve its stable ID and require an executable mapping. Instructions define actor, preconditions, state, action, and observable outcome; assert business behavior when transport success is insufficient.

## REPORT OUTPUT

Run `hrns qa report --run <id> --output <format>`; supported formats are `json`, `html`, `markdown`, and `send-to-developer` (LLM-generated scope). Omit `--output` for selection (default: `json`).

REQUIRED: Write atomically; escape HTML; use one evidence link per scenario; modal shows previews and direct links. Generate scope from results.

REQUIRED: Preserve scope bytes, scenario IDs, and one runner session. Remove temporary JSON; escape raw NUL as `\\u0000` in repair prompts.

Adaptive analysis is opt-in and runs one bounded evidence pass. It may append and execute material gaps, then reporting starts; it does not repeat analysis. Choose **resume with analysis** for saved plans; plain **resume** runs saved scenarios only.

## DEVELOPMENT RENEWAL

Ask before sending **FAILED** or **BLOCKED** scenarios to development (default `false`); skip reports, noninteractive terminals, and actionless runs. Preserve `--agent`/`--debug`; use `hrns run --reset --run <id>`. Never combine `--run` with `--scope`.

## VERDICTS

| Verdict | Condition |
| --- | --- |
| PASS | Every required scenario passed with evidence. |
| FAIL | A required assertion failed. |
| BLOCKED | A scenario cannot execute or target is unavailable. |
| INCONCLUSIVE | Required evidence is missing or unverified. |

Coverage counts reconcile planned scenarios; only passed or failed observations count as tested. Unplanned categories are omitted.

REQUIRED: Reconcile verdicts against required plan scenarios, not only returned driver results. Driver execution exceptions become redacted **BLOCKED** results. Before adaptive continuation, persist the revised plan version without the previous verdict or completion timestamp; an interrupted continuation must not retain **PASS**.

## TERMINAL PROGRESS

REQUIRED: Emit runtime, phase, scenario, and completion events via `QaTerminalPresenter`; disable ANSI without TTY. Include IDs, totals, errors.

## DRIVERS

Reuse browsers with an isolated context per scenario; close contexts on failure. Without a profile, keep login and verification together. With non-`none`, start authenticated and omit login. Use DOM readiness and bounded selector/URL waits, not `networkidle`. Browser assertions poll for expected state for up to three seconds. Keep explicit navigation, URL waits, and URL assertions within the target origin. Curl never follows redirects; MCP follows same-origin redirects and matches the active JSON-RPC response ID. Require screenshots and redacted observations.

Legacy **Streamable HTTP** initializes a session and reuses its returned session and protocol-version headers. Stateless `2026-07-28` requests carry protocol, client, capability, method, and tool headers. CLI/MCP calls have 30-second deadlines; WebSocket exchanges have five-second deadlines. Accessibility checks cover image alternatives, form labels, and document language, not full conformance. Target probes check reachability; drivers own HTTP status assertions.

REQUIRED: Browser readiness checks include browser launch and cleanup, not only module import. Pass the assertion's remaining three-second budget to locator reads; propagate cancellation through actions, waits, assertions, and screenshot capture. CLI deadline termination remains **BLOCKED** with its original cause, not an exit-code mismatch.

Target overrides rebase same-origin navigation, URL waits, URL assertions, and absolute HTTP request URLs. Preserve relative HTTP paths and foreign URLs for subsequent validation; never mutate the saved plan.

## AUTHENTICATION

REQUIRED: Support `none`, `basic`, `bearer`, `api-key`, and `cookie` profiles. Prefer environment references; use `valueFrom`; restrict credentials to same-origin traffic; redact resolved secrets.

REQUIRED: Keep `hrns qa auth` form-only; block unmapped authenticated CLI/WebSocket. PROHIBITED: Persist resolved secrets. OAuth2, HMAC, and mTLS remain outside scope.

Bearer and API-key browser profiles use Chromium Fetch interception for each network hop. Inject headers only on the target origin and remove inherited configured headers elsewhere, including redirects. Preserve same-origin redirects and browser URLs without replaying requests. These two profiles block service workers so their traffic cannot bypass page interception; Basic, cookie, and anonymous contexts retain browser defaults.

### PLANNING CONTEXT

REQUIRED: Pass only selected profile name and mode to planning and adaptive analysis; never pass or persist resolved values.
REQUIRED: In web-capable profiles, non-`none` starts browser authenticated; omit login, sign-in, credential-entry, auth-redirect, logout, and session-ending actions unless the scope explicitly tests that lifecycle.
REQUIRED: Omit `authProfile` to inherit selected profile. Set `authProfile: "none"` for anonymous or login coverage; keep it separate.

## EXECUTION MEMORY

`docs/qa/execution-memory.json` retains ten verified target hints for 30 days. REQUIRED: Revalidate hints; explicit input wins. Actionless resume keeps its target; use `qa run` when a new target must win. PROHIBITED: Store outcomes, credentials, ports, or agent instructions.

## LIMITS

REQUIRED: Cap `REPORT.md` at 8,000 characters; mark truncation and unresolved **Open Points**. PROHIBITED: Use LLM prose as verdict truth. Start framework/API processes separately.

## REFERENCES

- [**ARCHITECTURE.md**](../../adr/ARCHITECTURE.md): Ports and adapter boundaries.
- [**TESTS.md**](../../adr/TESTS.md): Test commands and isolation rules.
- [**SDK_CLI.md**](../cli/../cli/sdk_cli.md): CLI registration and command conventions.
- [**SDK_SETTINGS.md**](../orchestration/SDK_SETTINGS.md): QA phase defaults.
- [**SDK_TERMINAL_UI.md**](../terminal/SDK_TERMINAL_UI.md): Shared terminal helpers.
