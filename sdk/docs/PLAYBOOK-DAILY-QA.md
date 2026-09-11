# Playbook — Daily QA

Use this playbook to validate a completed change as a human would, independently from development. Read the [SDK README](../README.md) for installation and the [QA Tester feature document](./feature/QA_TESTER.md) for the implementation boundary.

## Daily operating rule

Plan the acceptance condition first, run it against the application a user would reach, inspect its evidence, and record the QA verdict. A passing build, unit test, or development-agent report is not a substitute for this flow.

```text
LLM planning -> curl/Playwright execution -> LLM reporting -> final report
```

`hrns qa` accepts an open scope or optional detailed scenarios. The LLM inspects the project, generates missing scenarios, and selects executable API or browser actions. It does not start the target application; start it first and provide its reachable URL.

## Agentic daily flow

Use open scope when QA should discover coverage:

```bash
# CORRECT: LLM inspects project and generates endpoint scenarios
hrns qa --scope "Test endpoint X" --target http://127.0.0.1:3000
```

Add detailed scenarios when known. The LLM treats them as baseline, analyzes gaps, and may add scenarios:

```bash
# CORRECT: supplied scenarios plus agent-discovered coverage
hrns qa --project ../checkout --scope "Validate checkout" --scenario "Valid card completes payment" --scenario "Declined card shows a recoverable error" --profile web

# WRONG: omit both scope and scenarios
hrns qa --target http://127.0.0.1:3000
```

CLI output contains only final JSON report: verdict, summary, success criteria, bugs, and execution errors. Audit artifacts remain under `.harness-kit/qa/`.

## One-time browser setup

API validation uses a system `curl` executable. Interface and web-game validation use Playwright with Chromium.

```bash
rtk npm install
rtk npx playwright install chromium

# Check that the selected browser profile is ready
hrns qa doctor --profile web
```

Run `doctor` before every new machine, dependency refresh, or browser-profile failure. Do not use production credentials or production data in a QA plan.

## Manual API endpoint check

Use low-level subcommands only when deterministic, non-agentic control is required. The request runs through real `curl`; request metadata and response body become evidence.

```bash
# The target app must already be listening on port 3000.
hrns qa plan --plan create-order --target http://127.0.0.1:3000 --profile api --criterion "A valid order is accepted" --method POST --path /orders --expect-status 201
hrns qa execute --plan create-order@1
```

The same short flow can be run in one command:

```bash
hrns qa run --plan health-check --target http://127.0.0.1:3000 --profile api --criterion "Health is available" --method GET --path /health --expect-status 200
```

Inspect the result with:

```bash
hrns qa report --run <qa-run-id>
```

At present, the CLI request flags define one HTTP request for the generated plan. Create a separate plan for each endpoint or use the SDK to construct a multi-scenario plan deliberately.

## Manual interface check

For a browser interface, validate the visible user path: navigate, click the controls, fill a form, submit it, and make sure the page remains operational. Browser flows save a final screenshot and fail if the page emits a JavaScript runtime error.

```bash
hrns qa doctor --profile web
hrns qa execute --plan checkout-human-flow@1
hrns qa report --run <qa-run-id>
```

The current CLI creates deterministic scenarios from criteria but does not infer browser controls. Create the browser actions through the SDK or a persisted plan before executing it. Supported actions are `navigate`, `click`, `fill`, `press`, and `wait`; each action should map to an observable human step. Do not claim UI coverage merely because the page opened.

Example action sequence for a checkout:

```text
navigate /cart
click [data-testid="checkout"]
fill [name="email"] with a test address
click [type="submit"]
wait for the confirmation to settle
```

## Manual web-game check

Treat a web game as a player would: start a session, perform meaningful controls, wait for state to advance, and inspect the final screen and browser errors.

```bash
hrns qa doctor --profile web-game
hrns qa execute --plan tetris-human-flow@1
hrns qa report --run <qa-run-id>
```

A useful minimal game plan includes a start control, at least two player inputs, and a wait long enough for gameplay to update. For example: click Start, press `ArrowLeft`, press `ArrowUp`, press `ArrowDown`, then wait. This proves only the planned flow; add scenarios for pause, restart, scoring, game over, and failure recovery when those behaviors matter.

Native-game automation is outside the current driver boundary. Use the `web-game` profile for browser-based games only.

## Evidence and verdicts

Every run is stored under the target project's `.harness-kit/qa/runs/<qa-run-id>/` directory:

| Item | Location | What to review |
| --- | --- | --- |
| Run state | `state.json` | Final verdict, scenario status, reason, and timestamps. |
| API evidence | `evidence/<scenario>/` | The `curl` request metadata and response body. |
| Browser evidence | `evidence/<scenario>/final.png` | Final browser screenshot after the planned user flow. |

| Verdict | Meaning | Daily action |
| --- | --- | --- |
| `PASS` | All required scenarios passed with evidence. | Attach the run ID to the delivery record. |
| `FAIL` | A required assertion or browser runtime check failed. | Report the failing action and evidence; return the issue to development. |
| `BLOCKED` | A required scenario could not run. | Fix environment access or dependencies, then rerun. |
| `INCONCLUSIVE` | Coverage or evidence is insufficient. | Add the missing scenario or assertion before acceptance. |

## Failure triage

1. Run `hrns qa report --run <qa-run-id>` and identify the first failed or blocked scenario.
2. For API failures, inspect the saved response body and verify the local test target is the intended version.
3. For browser failures, open `final.png` and treat a `Browser page error` as a product defect until proven otherwise.
4. For `BLOCKED`, confirm the target server is running, the URL is reachable, and `hrns qa doctor --profile web` succeeds when browser testing.
5. Preserve the run directory. Create a new run after a fix; do not overwrite evidence from the failed attempt.

## End-of-day handoff

Report the plan ID and version, run ID, environment URL, verdict, tested scenarios, and any evidence path. A concise handoff looks like this:

```text
QA: checkout-human-flow@1
Run: checkout-human-flow-<timestamp>
Target: http://127.0.0.1:4173
Verdict: PASS
Evidence: .harness-kit/qa/runs/checkout-human-flow-<timestamp>/
```

If the verdict is not `PASS`, describe the user action that failed and link the matching evidence instead of summarizing it as a generic test failure.

## Further reading

- [README — QA command reference](../README.md)
- [QA Tester — architecture, drivers, and current limits](./feature/QA_TESTER.md)
- [Daily Use Playbook — orchestration workflows](./PLAYBOOK-DAILY-USE.md)
