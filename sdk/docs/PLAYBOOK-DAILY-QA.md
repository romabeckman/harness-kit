# Playbook — Daily QA

Use this playbook to validate a completed change as a human would, independently from development. Read the [SDK README](../README.md) for installation and the [QA Tester feature document](./feature/QA_TESTER.md) for the implementation boundary.

## Daily operating rule

Plan the acceptance condition first, run it against the application a user would reach, inspect its evidence, and record the QA verdict. A passing build, unit test, or development-agent report is not a substitute for this flow.

```text
LLM planning -> plan validation/preflight -> curl/Playwright execution -> adaptive analysis -> optional LLM reporting
```

`hrns qa run` accepts an open scope or optional detailed scenarios. The LLM inspects the project, generates missing scenarios, and selects executable API or browser actions. It does not start the target application; start it first and provide its reachable URL. `hrns qa` is an alias for `hrns qa run`.

## Agentic daily flow

Use open scope when QA should discover coverage:

```bash
# CORRECT: LLM inspects project and generates endpoint scenarios
hrns qa run --scope "Test endpoint X" --target http://127.0.0.1:3000

# CORRECT: execute and generate/render the report during the same run
hrns qa run --report --scope "Test endpoint X" --target http://127.0.0.1:3000
```

Add detailed scenarios when known. The LLM treats them as baseline, analyzes gaps, and may add scenarios:

```bash
# CORRECT: supplied scenarios plus agent-discovered coverage
hrns qa run --project ../checkout --scope "Validate checkout" --scenario "Valid card completes payment" --scenario "Declined card shows a recoverable error" --profile web --target http://127.0.0.1:3000

# Interactive: omit scope and scenarios to enter them through prompts
hrns qa run --target http://127.0.0.1:3000
```

Without `--report`, the run executes and saves state/evidence but skips LLM report generation. Add `--report` to generate and render the report during execution. Audit artifacts remain under `docs/qa/`. The separate `hrns qa report` command emits the final JSON report and can regenerate `report.json` and `REPORT.md` for a completed run.

## Exploratory saved-plan sweep

Run every latest saved QA plan before a release or end-of-day handoff:

```bash
# CORRECT: replay all current saved plans against one reachable target
hrns qa exploratory --target http://127.0.0.1:3000

# CORRECT: replay plans stored in another project
hrns qa exploratory --project ../checkout --target http://127.0.0.1:3000
```

The command validates and executes plans sequentially without planning or adaptive additions. One invalid or blocked plan does not stop later plans. Review `docs/qa/exploratory/<exploratory-run-id>/report.json` for global totals, per-plan verdicts, run IDs, results, and errors. Evidence remains under each `docs/qa/runs/<qa-run-id>/` directory.

Create profiles with the form helper when the JSON file does not exist or needs another mode:

```bash
hrns qa auth
hrns qa auth --project ../checkout
```

Select the authentication mode and profile name, then choose `env` or `insecure`. Provide the username and password for Basic auth, the JWT/token for Bearer auth, or the header/cookie fields for other modes. Each invocation adds one profile and refuses to overwrite an existing profile.

## Run against protected targets

Add optional `.harness-kit/auth.json` with named `none`, `basic`, `bearer`, `api-key`, or `cookie` profiles. The form defaults to `env` storage (reference only). Selecting `insecure` shows a warning, requires confirmation, and stores the entered credential directly in `auth.json`. The file is ignored by Git but is not encrypted; protect it, use disposable least-privilege credentials, and never use production credentials.

```json
{ "schemaVersion": 1, "defaultProfile": "qa-user", "profiles": { "qa-user": { "mode": "bearer", "token": { "source": "env", "name": "QA_USER_TOKEN" } } } }
```

Set the referenced variable in the test environment, then select the profile:

```bash
hrns qa run --auth qa-user --scope "Validate protected orders" --target http://127.0.0.1:3000 --profile api
hrns qa exploratory --auth qa-user --target http://127.0.0.1:3000
```

Omit `--auth` to use `defaultProfile`; interactive execution offers configured profiles. Resolved credentials are used only at execution time and are not copied into plans, prompts, reports, execution memory, or persisted evidence. `insecure` literals are the intentional exception in `auth.json` itself; do not copy them elsewhere.

### Authentication boundaries by engine

- API and security requests use Curl with the selected Basic, Bearer, API-key, or Cookie credentials. Curl passes its transient request configuration through stdin, so credentials do not appear in process arguments. Request/response evidence is redacted by credential field and exact resolved value.
- MCP HTTP requests receive the selected authentication headers. MCP response evidence is redacted by field and exact resolved value.
- Browser, mobile, and accessibility profiles scope Basic credentials to the configured target origin. Bearer/API-key headers are added only to same-origin requests, and cookies are installed through the browser context. Cross-origin requests never receive header credentials.
- CLI profiles do not have a generic HTTP-header mapping. Add an explicit `environment` map for the variables expected by the command; otherwise an authenticated CLI scenario is `BLOCKED` before spawning. CLI arguments, stdout, and stderr are redacted before evidence is written.
- WebSocket scenarios with any non-`none` profile are `BLOCKED`; WebSocket header authentication is not supported. Do not move a token into a query string as a workaround.

For example, map a shared environment-backed token to the variable expected by a CLI:

```json
{
  "mode": "bearer",
  "token": { "source": "env", "name": "QA_USER_TOKEN" },
  "environment": {
    "APP_TOKEN": { "source": "env", "name": "QA_USER_TOKEN" }
  }
}
```

The `hrns qa auth` form does not infer arbitrary CLI variable names. Add mappings deliberately and prefer `env` references; literal mappings are passed to the child process at runtime and should be restricted to disposable local testing.

## One-time browser setup

API validation uses a system `curl` executable. Interface and web-game validation use Playwright with Chromium.

```bash
rtk npm install
rtk npx playwright install chromium

# Browser readiness is checked during the QA run; there is no separate QA doctor command.
```

Run the browser setup after every new machine or dependency refresh. Do not use production credentials or production data in a QA run.

## API endpoint check

The API profile executes generated HTTP scenarios through real `curl`; request metadata and response bodies become evidence after credential redaction. Describe expected behavior in the scope or scenarios.

```bash
# The target app must already be listening on port 3000.
hrns qa run --report --scope "A health check returns HTTP 200" --target http://127.0.0.1:3000 --profile api
```

To regenerate the report later, optionally selecting the LLM model and reasoning effort:

```bash
hrns qa report --run <qa-run-id> --model <model> --effort high
```

Repeat `--scenario` for mandatory cases, such as valid, invalid, boundary, and authorization behavior.

## Manual interface check

For a browser interface, validate the visible user path: navigate, click the controls, fill a form, submit it, and make sure the page remains operational. Browser flows save a final screenshot and fail if the page emits a JavaScript runtime error.

```bash
hrns qa run --report --scope "A guest can complete checkout" --scenario "A valid card completes payment" --target http://127.0.0.1:3000 --profile web
```

The planner maps the scope and scenarios to browser actions. Provide selectors or observable outcomes in scenarios when the path needs precision. Supported actions are `navigate`, `click`, `fill`, `press`, and `wait`; each action should map to an observable human step. Do not claim UI coverage merely because the page opened.

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
hrns qa run --report --scope "A player can start and control a game" --scenario "The game accepts movement input and advances state" --target http://127.0.0.1:3000 --profile web-game
```

A useful minimal game plan includes a start control, at least two player inputs, and a wait long enough for gameplay to update. For example: click Start, press `ArrowLeft`, press `ArrowUp`, press `ArrowDown`, then wait. This proves only the planned flow; add scenarios for pause, restart, scoring, game over, and failure recovery when those behaviors matter.

Native-game automation is outside the current driver boundary. Use the `web-game` profile for browser-based games only.

## Evidence and verdicts

Every run is stored under the target project's `docs/qa/runs/<qa-run-id>/` directory:

| Item | Location | What to review |
| --- | --- | --- |
| Run state | `state.json` | Final verdict, scenario status, reason, and timestamps. |
| Generated report | `report.json`, `REPORT.md` | Created by `--report` or `hrns qa report`; review synthesized findings and open points. |
| API evidence | `evidence/<nnn>-<scenario>/` | The `curl` request metadata and response body. Evidence folders use a zero-padded execution number, such as `001-create-order`. |
| Browser evidence | `evidence/<nnn>-<scenario>/final.png` | Final browser screenshot after the planned user flow. |

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
4. For `BLOCKED`, confirm the target server is running, the URL is reachable, and Chromium is installed when browser testing. If the reason names unsupported authentication, add an explicit CLI environment mapping or run the scenario unauthenticated; authenticated WebSocket scenarios are not currently executable.
5. Preserve the run directory. Create a new run after a fix; do not overwrite evidence from the failed attempt.

## End-of-day handoff

Report the plan ID and version, run ID, environment URL, verdict, tested scenarios, and any evidence path. A concise handoff looks like this:

```text
QA: checkout-human-flow@1
Run: checkout-human-flow-<timestamp>
Target: http://127.0.0.1:4173
Verdict: PASS
Evidence: docs/qa/runs/checkout-human-flow-<timestamp>/
```

If the verdict is not `PASS`, describe the user action that failed and link the matching evidence instead of summarizing it as a generic test failure.

## Further reading

- [README — QA command reference](../README.md)
- [QA Tester — architecture, drivers, and current limits](./feature/QA_TESTER.md)
- [Daily Use Playbook — orchestration workflows](./PLAYBOOK-DAILY-USE.md)
