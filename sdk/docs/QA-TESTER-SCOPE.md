# Independent QA / Tester — Development Scope

Status: proposed; no runtime implementation or tool installation.
Date: 2026-09-11.

## 1. Objective

Add an independent QA workflow that plans and performs acceptance testing against a running product. It must exercise public interfaces as a user would: HTTP requests for APIs, navigation and input for websites, and actual gameplay for games.

“As a human” means observing the product, choosing an action, performing it through normal controls, and checking the result. Reading source, generating tests, receiving a developer's success claim, or taking an initial screenshot does not demonstrate acceptance. Automated interaction also does not establish subjective human usability or enjoyment.

Deliver separate planning and execution commands, durable evidence, reproducible defects, and an explicit verdict. Allow QA to run against software developed outside Harness. Development integration is optional and consumes the same independent workflow.

## 2. Repository findings

These findings describe inspected code, not proposed behavior.

| Existing component | Finding | Design consequence |
| --- | --- | --- |
| [ReviewHandler](../src/orchestrator/phases/ReviewHandler.ts) | Calls Tech Lead and adversarial QA during `REVIEW`. Prompts emphasize code, edge cases, vulnerabilities, and developer handoff. Outputs use `TL.json` and `QA.json`. | Preserve existing reviews; add runtime acceptance as a distinct responsibility. |
| [ValidationGate](../src/validation-gate/ValidationGate.ts) | Evaluates review scores, vulnerability/crash flags, and rework counts. Does not require executed scenarios or runtime evidence. | Acceptance needs a separate deterministic gate; scores cannot substitute for observations. |
| [ReviewHandler](../src/orchestrator/phases/ReviewHandler.ts) | Marks features completed on PASS. `skipValidation` also marks completion using synthetic scores. | An integrated QA gate must run before completion; a skipped review cannot fabricate acceptance. |
| [ChainBuilder](../src/orchestrator/ChainBuilder.ts), [ReentryResolver](../src/orchestrator/ReentryResolver.ts) | Development pipeline owns phase order and resume logic. | A standalone QA state machine avoids requiring development artifacts or a backlog. Integration requires explicit phase and resume changes. |
| [IAgentRunner](../src/agent-runner/IAgentRunner.ts), [runner types](../src/agent-runner/types.ts) | Common contract covers prompts, sessions, results, and cancellation. No shared tool capability or browser-session contract. | Reusing an agent invocation does not prove browser or terminal execution is available. |
| [SettingsSchema](../src/settings/SettingsSchema.ts), [HarnessSettings](../src/settings/HarnessSettings.ts) | Phase settings expose model, effort, and timeout. | Reuse `qa_plan` / `qa_execute` settings; introduce explicit runtime configuration separately. |
| [CLI entrypoint](../src/cli/run.ts) | No `qa` command exists. | Add command routing and a QA application service. |
| [DiagnoseService](../src/diagnose/DiagnoseService.ts) | Demonstrates an independent service with injected ports and separate state. | Follow this architectural pattern without coupling QA to diagnosis. |
| `src/qa/`, [package.json](../package.json) | QA directory has no implementation files; package declares no Playwright dependency. | QA runtime and browser provisioning are new work. |
| [Testing protocol](./adr/TESTS.md), [E2E helpers](../tests/e2e/helpers/MockAgentCli.ts) | Existing SDK tests use isolated sandboxes and mocked agents. | Keep SDK verification deterministic; add real local HTTP/browser fixtures for interaction proof. |

Documentation mentions Vitest 4.1.10, while the inspected manifest declares Vitest 5.0.0. Use the actual manifest and lockfile when implementing; do not copy outdated version assumptions.

## 3. Scope and rollout

The first usable release includes standalone API, web interface, and browser-game QA. Browser games must be tested through keyboard, mouse, or touch controls, including canvas/WebGL games when visual interpretation is available.

Subsequent milestones add optional development gating and a native-game adapter. Native desktop, mobile, console, VR, hardware input, and arbitrary high-speed gameplay must not be advertised as supported by Playwright. Unsupported targets produce a visible coverage limitation and cannot pass required acceptance.

Out of scope: fixing product source from QA, automatic deployment, production test execution by default, load testing, exhaustive security certification, subjective “fun” scoring, and a new graphical dashboard. Existing adversarial QA and developer tests remain useful inputs.

## 4. Independent workflow

```mermaid
flowchart TD
    A[Scope, acceptance criteria, target] --> B[QA_PLANNING]
    B --> C[Versioned plan]
    C --> D[PREFLIGHT]
    D -->|Ready| E[QA_EXECUTION]
    D -->|Unavailable environment or capability| H[BLOCKED]
    E --> F[Evidence validation and report]
    F --> G[PASS / FAIL / BLOCKED / INCONCLUSIVE]
    G -->|New build supplied| C
```

### Planning

Inputs: requirements or scope file, acceptance criteria, target URLs or launch configuration, optional OpenAPI document, test accounts, platform constraints, and optional feature/build identifiers. Standalone operation must not require `TDD-OUTPUT.json`, development sessions, or Harness product files.

Planner responsibilities:

1. Identify all applicable surfaces. A feature can require both API and browser testing.
2. Map every acceptance criterion to observable scenarios, including negative cases and relevant regression journeys.
3. Define prerequisites, test data, user actions, expected observations, evidence requirements, and cleanup per scenario.
4. Record required capabilities: HTTP execution, browser interaction, image interpretation, or native input.
5. Set action, time, and cost budgets. Add a bounded exploratory charter alongside scripted scenarios.
6. Identify missing requirements or unsupported surfaces. Do not silently invent business rules or remove difficult criteria.
7. Persist a versioned plan before any product test action. Plan-only mode performs no application startup or interaction.

The developer handoff may locate the application, but cannot define whether it passes. A different QA session derives expected behavior from requirements. Changed requirements create a new plan version; executor cannot weaken expected outcomes to match observed failures.

### Preflight and execution

Validate plan schema, capabilities, target identity, credentials, tool/browser availability, workspace permissions, environment isolation, and evidence directory. Attach to a supplied test environment or start the explicitly configured local application. Record readiness checks and owned process identifiers.

Execute an observation/action loop: observe current state, choose an allowed action, execute it, collect the actual tool result, compare with expected behavior, and persist the checkpoint. Keep a browser context alive for each journey; isolate accounts and data between independent journeys.

The SDK owns action execution and evidence collection. The agent proposes typed actions and interprets observations. Free-form agent text cannot create an execution receipt. Capture assertions separately from tool success: a successful click or HTTP response does not necessarily satisfy a business requirement.

On a reproducible defect, save reproduction steps and continue independent scenarios where possible. On timeout, cancellation, unavailable tools, or exhausted budgets, preserve partial results. Stop owned processes and close browser contexts in all terminal paths. Never terminate an externally supplied server.

## 5. Interaction profiles

| Surface | Required behavior | Required evidence |
| --- | --- | --- |
| API | Execute actual `curl` requests against a running endpoint. Check applicable methods, authentication, permissions, validation, errors, and public readback of mutations. | Sanitized request, response status/headers/body, process exit code, timestamps, assertions, target/build identity. |
| Web UI | Navigate, click, type, submit, scroll, use keyboard, and revisit relevant routes. Check visible outcomes, persistence after reload where applicable, console exceptions, and failed requests. | Ordered action log, observed UI states, assertions, screenshots at relevant checkpoints, browser trace. |
| Browser game | Launch, enter gameplay, exercise controls, observe progress, reach an applicable success/failure state, restart, and test pause/resume when specified. | Input sequence with timing, screenshots or video, visible game-state observations, console/runtime errors, outcome assertions. |
| Native game | Launch a native build, focus its window, capture frames, inject permitted OS input, and verify gameplay outcomes. | Same gameplay evidence plus platform, window, input driver, build, and process identity. Delivered through a later adapter. |

Use the actual curl executable (`curl.exe` on Windows) through structured arguments. Capture both transport failure and HTTP outcome; neither process exit zero nor HTTP 200 alone establishes success. Keep fixture credentials out of persisted commands and reports.

For web acceptance, use visible controls. Calling page functions, editing storage, injecting scores, or invoking hidden game methods must not count as user interaction. Explicit setup hooks may prepare fixtures but remain separate from acceptance actions.

Canvas/WebGL may provide little semantic UI information. Use screenshots, a model capable of interpreting images, coordinate input, and bounded input timing. If the game requires unsupported reaction speed or the visible outcome cannot be established, report INCONCLUSIVE or BLOCKED with the exact missing capability. Do not infer “playable” from a loaded canvas.

## 6. Architecture and Playwright enablement

Create a QA application service under `src/qa/` with ports and injected adapters:

| Proposed component | Responsibility |
| --- | --- |
| `QaService` | `plan`, `execute`, `run`, `resume`, and `report` use cases; independent lifecycle. |
| `QaAgentAdapter` | Separate planner/executor sessions through `IAgentRunner`; typed planning and action requests. |
| `IQaInteractionDriver` | Capability discovery, observations, allowed actions, execution receipts, cancellation, cleanup. |
| `CurlDriver` | Real HTTP requests through a bounded subprocess. |
| `PlaywrightDriver` | Persistent browser sessions, semantic controls, screenshots, traces, keyboard/mouse/touch actions. |
| `IQaEnvironment` | Attach/start, readiness, build identity, isolated data, and owned process cleanup. |
| `IQaRunStore` | Plans, run state, checkpoints, reports, evidence metadata, and exclusive run leases through atomic persistence. |
| `QaVerdictPolicy` | Pure acceptance decision from validated results and coverage. |

Prefer SDK-managed Playwright actions for the initial implementation: the SDK can enforce permitted actions and collect evidence regardless of whether a provider exposes native tools. Reuse `IAgentRunner` for reasoning, not as proof that an agent performed an action. Keep driver selection at composition boundaries.

Playwright also provides a coding-agent CLI and an MCP interface. MCP supports structured browser observations and optional coordinate interactions. A runner-specific CLI/MCP bridge can be added when its capabilities and receipts are verified; simply mentioning Playwright in a prompt is insufficient. This choice is an architectural recommendation, not an existing repository capability. See [Playwright coding-agent CLI](https://playwright.dev/docs/getting-started-cli) and [official Playwright MCP repository](https://github.com/microsoft/playwright-mcp).

Provision a pinned, tested Playwright package and compatible browser binary. Make browser installation an explicit setup action, with an installation-free capability check during QA runs. Start with Chromium; add other engines through explicit configuration. Provide a container recipe with required OS/browser dependencies. Avoid changing personal browser profiles or global agent configuration.

Record traces for inspection alongside explicit acceptance assertions. Playwright Trace Viewer exposes recorded actions and browser state; traces support diagnosis but do not themselves decide acceptance. See [Trace Viewer](https://playwright.dev/docs/trace-viewer).

The common runner output currently has no image-observation contract. Add an optional capability interface and a transport for structured observations plus image references/content. Prove image delivery with at least one supported runner before claiming canvas/game support. Unsupported runners remain usable for planning or text-based API execution. Preserve existing prompt transport behavior and propagate `AbortSignal` throughout.

QA agents receive read access to requirements and product snapshots plus write access to QA artifacts and isolated fixtures. Enforce this through execution boundaries; prompts alone do not provide isolation. Several existing CLI runners use broad approval flags, so they cannot be assumed to satisfy this boundary automatically.

## 7. Contracts, state, and evidence

Proposed artifact layout:

```text
.harness-kit/qa/
  plans/<plan-id>/<version>.json
  runs/<run-id>/
    state.json
    target.json
    events.jsonl
    results.json
    report.md
    evidence/<nnn>-<scenario-id>/...
```

Persist through a dedicated QA store port implemented with existing atomic state conventions. Do not place runtime acceptance results in the adversarial review's `QA.json`.

Minimum contracts:

- `QaPlan`: schema version, plan identity/version, source references and hashes, requirement coverage, profiles, scenarios, prerequisites, required capabilities, exploratory charter, and budgets.
- `QaScenario`: stable ID, criterion IDs, required/optional classification, setup, actions, expected observations, evidence policy, and cleanup.
- `QaRun`: run ID, plan version/hash, optional feature ID, target fingerprint, environment identity, runner/model/tool versions, session IDs, state, budgets consumed, and timestamps.
- `QaScenarioResult`: execution status, observed result, assertions, evidence IDs, defect IDs, attempts, and reason for any incomplete check.
- `QaEvidence`: immutable ID, run/scenario/action identity, capture time, artifact path, hash, and capturing adapter.
- `QaDefect`: severity, affected criterion, reproducible steps, expected versus actual result, environment, evidence, and reproduction attempts.

Fingerprint the tested artifact, not only Git HEAD. Include relevant uncommitted/untracked source or build hashes for local work; use a deployment/build identifier for remote targets. If identity is unverifiable, state that limitation and do not reuse the result as an integrated gate for another build.

Resume retains completed evidence only when plan, build, and environment identity match. An interrupted mutation is not replayed blindly: inspect its public effect or reset isolated fixtures first. A changed build creates a new run. Concurrent runs require independent environments or a target lease. Atomic state replacement and append-only execution events prevent one run from overwriting another.

Persist evidence references only within the run directory, reject traversal and symlink escapes, redact secrets, and configure retention and maximum artifact sizes. Browser traces and screenshots may contain credentials or user data; use synthetic accounts and do not upload them automatically.

## 8. Verdict rules

| Verdict | Rule |
| --- | --- |
| PASS | Every required criterion has executed, current, sufficient evidence; all required assertions pass; no unresolved blocking defect. |
| FAIL | At least one required acceptance assertion demonstrably fails, or an executed journey reveals a blocking functional defect. Report incomplete coverage separately. |
| BLOCKED | A prerequisite, permission, environment, or required capability prevents execution and no definitive failure already determines FAIL. |
| INCONCLUSIVE | Execution occurs but observations, identity, evidence integrity, instability, or exhausted budgets prevent a defensible PASS/FAIL. |

Cancellation is a run lifecycle state, not PASS. Per-scenario SKIPPED is visible and cannot satisfy required coverage. A zero-scenario plan, missing evidence, malformed agent result, or “tests passed” prose cannot produce PASS. A retry records a new attempt; it never erases a previous failure. A later passing attempt alone cannot resolve unexplained flakiness.

Suggested CLI exit codes: `0` PASS, `1` FAIL, `2` BLOCKED/INCONCLUSIVE, `130` cancellation. Plan-only completion returns `0` for a valid persisted plan, explicitly labeled as planning success rather than product acceptance. Invalid commands/configuration use `2` with a structured reason.

## 9. Proposed CLI and configuration

The following commands are proposed interfaces; they do not exist yet.

```text
hrns qa plan --scope <path> --target <url> --profile api,web
hrns qa execute --plan <path>
hrns qa run --scope <path> --target <url> --profile web-game
hrns qa resume --run <id>
hrns qa report --run <id> --format markdown|json
hrns qa doctor --profile api,web,web-game
```

Support multiple named targets for features spanning API and frontend services. Allow optional `--feature` linkage without requiring the development backlog. Provide non-interactive execution for CI. Store target configuration separately from runner model settings: launch executable/argument array, cwd, readiness probe, allowed origins, account references, browser/viewport, evidence policy, and budgets.

Use existing phase settings resolution for `qa_plan` and `qa_execute`. Credentials come from references resolved at runtime. Keep standalone commands free from development, deployment, commit, or backlog mutations.

## 10. Optional development integration

After standalone acceptance works, add a `QA_ACCEPTANCE` phase after successful `REVIEW` and before `TRANSITION`. This handler calls `QaService`; it does not duplicate QA logic. Within the service, planning and execution remain distinct persisted stages.

For QA-enabled runs, refactor `ReviewHandler` so review PASS records review approval but leaves the feature pending acceptance. Only acceptance PASS for the current artifact can mark it completed. Confirm deploy selection cannot consume a pending acceptance feature.

On acceptance FAIL, send structured reproduction evidence to the existing rework mechanism with bounded retries. QA never edits the product. Development supplies a new artifact, review runs again, and QA retests affected criteria plus required regression journeys. BLOCKED and INCONCLUSIVE pause for the relevant environment/capability issue; they do not automatically consume developer reworks.

Add an explicit acceptance policy, initially disabled for compatibility. If enabled, `quick`, `fast`, `skipValidation`, and manual review-score overrides must not bypass required runtime acceptance. Reports show separate review and acceptance statuses. Legacy completed features remain legacy/unverified; never synthesize historical QA PASS records.

Integration touches `Phase`, `ChainBuilder`, review completion, `ReentryResolver`, persisted state parsing, steering rollback rules, CLI resume choices, progress formatting, session cleanup, and reports. Add resume tests for interruption before acceptance, during execution, and after report persistence but before feature completion.

## 11. Development backlog

| ID | Deliverable | Dependencies | Acceptance proof |
| --- | --- | --- | --- |
| QA-01 | Contracts, pure verdict policy, atomic run store, fingerprints, leases | None | Reject missing/stale evidence; preserve independent runs; interrupted writes do not corrupt state. |
| QA-02 | Planner, plan validation, requirement mapping, separate sessions, plan command | QA-01 | Persist API/web/game plans without development artifacts or product interaction. |
| QA-03 | Environment manager, typed action loop, curl driver, execute/run/report commands | QA-02 | Real local API: create/read succeeds; invalid input and unauthorized access are checked; seeded defect produces FAIL with replayable evidence. |
| QA-04 | Playwright provisioning, browser driver, observations, tracing, doctor command | QA-03 | Navigate and submit a local UI; detect a seeded broken journey; produce action-linked screenshot and trace evidence. |
| QA-05 | Visual observation transport and browser-game interaction | QA-04 | Play a local canvas game through controls, observe progress and terminal state, restart; a controls regression produces FAIL. |
| QA-06 | Resume, partial execution, budgets, redaction, cleanup, telemetry, packaging | QA-03 through QA-05 | Cancel/resume without blind mutation replay; no process leak; missing tools cannot PASS; report cost and coverage. |
| QA-07 | Optional development acceptance gate and rework handoff | QA-06 | Review PASS cannot complete an enabled feature before current-build acceptance; standalone QA still works independently. |
| QA-08 | Native-game capability spike and first desktop driver | QA-06 | Choose a supported OS/input approach; play a deterministic native fixture; document platform and latency limits. |

QA-01 through QA-06 constitute the initial standalone release. QA-07 is the integration milestone. QA-08 is required before claiming native-game coverage; its implementation scope depends on a demonstrated driver, not an assumption that browser automation can control desktop games.

Existing files likely to change: `src/cli/run.ts`, CLI help/services, `src/settings/SettingsSchema.ts`, settings defaults/resolution where needed, `src/index.ts`, package configuration, and documentation indexes. Most initial code belongs under `src/qa/`. Adapt runner capability/image transport at the agent port boundary without importing concrete providers into QA decisions.

HTTP endpoints are a later optional delivery surface, not required for initial independence. If added, reuse server use-case/port patterns and job infrastructure after verifying compatibility. Update DTO validation, routes, authorization tests, and `src/server/adapters/inbound/http/docs/OpenApiSpecGenerator.ts` together.

## 12. Verification and completion criteria

Use unit tests for state transitions, schemas, verdict policy, identity checks, path boundaries, budgets, and resume decisions. Mock paid/external agent calls according to repository rules. Use actual curl and browser processes against disposable local fixtures to verify interaction adapters; keep these fixtures in a dedicated runtime acceptance suite with suitable timeouts.

Fixture suite must include a small HTTP service, a navigable web form, and a deterministic canvas game. Each fixture has a working variant and seeded functional defects. A controlled planner/executor test double can issue actions, but action execution and evidence must come from real tools. Separately record a bounded live-agent qualification run before advertising autonomous gameplay; fixture automation alone does not prove agent judgment.

Required regression cases: zero scenarios; required scenario skipped; fabricated receipt; missing artifact; source changed mid-run; unavailable browser; no image capability; application startup failure; bad credentials; partial mutation before cancellation; duplicate resume; concurrent target access; timeout; flaky rerun; false-positive developer handoff; unsupported native target; quick-mode gate bypass; stale PASS reused after rework.

For implementation, follow repository verification order: `rtk npm install`, `rtk npm run lint`, `rtk npm run build`, `rtk npm run typecheck`, then `rtk npm run test`. Run existing E2E and new runtime acceptance suites for their affected boundaries. Document optional browser setup and keep external APIs out of deterministic tests.

The initial release is complete when standalone planning and execution demonstrably validate API, UI, and browser-game fixtures, detect seeded defects, retain inspectable evidence, resume safely, and never convert missing coverage into PASS. Report limitations by target and runner. No native-game claim precedes QA-08 evidence.

## 13. Analysis validation

This scope was checked against current orchestration, runner, settings, CLI, validation, and testing code, plus official Playwright documentation. No application code, dependencies, browser installation, or server endpoints were changed. Implementation checks and product execution are future acceptance work, not results claimed by this analysis.
