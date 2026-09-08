# Playbook — Daily Use

Practical recipes for the `hrns` CLI. Read the [SDK README](../README.md) first for installation, runner setup, and complete command reference.

## Safety first

`hrns run` includes a DEPLOY phase. Unless `--skip-deploy` is present, that phase runs `git add --all`, creates a commit, and runs `git push` in every configured project path.

Use `--skip-deploy` when:

- Repository policy forbids automated staging, commits, or pushes.
- A human must review the diff first.
- Project paths contain unrelated working-tree changes.
- A path is only a reference repository.

The CLI runner may use unattended permission flags. Steering text guides the model but does not enforce filesystem isolation. Use OS permissions, sandboxing, or a disposable copy for technically read-only content.

## Current defaults

| Setting | Default | Notes |
| --- | --- | --- |
| Runner | `claude-cli` | Override with `--agent` |
| Interactive mode choice | `fast` | Pass `--mode` to avoid the mode prompt |
| Acceptance scores | `0.70` | Both values use `[0.00, 1.00]` |
| Maximum reworks | `2` | Applies before final `FAILED` or `BLOCKED` verdict |
| Phase timeout | 30 minutes | Configurable in settings |
| Deploy | enabled | Disable with `--skip-deploy` |

## Execution modes

| Mode | Complexity | Review | Refinement | Memory | Deploy |
| --- | --- | --- | --- | --- | --- |
| `quick` | LOW | skipped | no | skipped | enabled |
| `fast` | LOW | adversarial QA only | no | enabled | enabled |
| `thinking` / `default` | AUTO | tech lead + QA | no | enabled | enabled |
| `deep_thinking` / `slow` | HIGH | tech lead + QA | yes | enabled | enabled |

`--complexity LOW|HIGH|AUTO` overrides planning complexity, but it does not change a mode's skip behavior. `--skip-validation`, `--skip-memory`, and `--skip-deploy` add independent skips.

## Scenario 1 — Start a reviewed project safely

```bash
hrns run \
  --reset \
  --mode thinking \
  --scope "Add customer account recovery with email tokens, expiry, rate limits, audit logs, and automated tests." \
  --path ./app \
  --skip-deploy
```

This command:

1. Deletes and recreates `docs/product/` for a new cycle.
2. Persists scope and project paths.
3. Lets planning classify LOW or HIGH complexity.
4. Runs both review agents.
5. Updates project memory.
6. Stops without staging, committing, or pushing.

Use `--reset` only when existing product state may be discarded.

## Scenario 2 — Multi-project frontend and backend

```bash
hrns run \
  --reset \
  --mode thinking \
  --scope "Build JWT authentication in api/ and a React login flow in web/. The web project consumes the api project. Implement and validate the API contract before dependent UI work." \
  --path ./api \
  --path ./web \
  --steering "Preserve shared request and response types across api/ and web/. Run each project's documented tests." \
  --skip-deploy
```

State dependencies explicitly in scope. The architect should encode them in `BACKLOG.md`, but dependency order is only as reliable as the generated backlog. Inspect it before allowing a long unattended run.

Each `--path` is passed to agent invocations. It does not assign ownership by itself; scope, backlog layer, and steering provide that context.

## Scenario 3 — Read-only reference repository

```text
workspace/
├── app/          # writable target
└── template/     # reference only
```

```bash
hrns run \
  --reset \
  --mode thinking \
  --scope "Build the service in app/ using patterns found in template/." \
  --path ./app \
  --path ./template \
  --steering "NEVER create, modify, rename, or delete files in template/. Treat template/ as read-only. Write only in app/." \
  --skip-deploy
```

This steering rule is not a security boundary. For a hard guarantee, make `template/` read-only through the operating system or provide a disposable copy. Also keep `--skip-deploy`; otherwise DEPLOY processes every configured project path.

## Scenario 4 — Quick proof of concept

Fast mode retains adversarial QA and memory while simplifying planning:

```bash
hrns run \
  --reset \
  --mode fast \
  --score 0.60 \
  --reworks 1 \
  --scope "Create a disposable analytics dashboard POC with mocked data. Prioritize the demonstrated flows listed in the acceptance criteria." \
  --path ./poc \
  --skip-deploy
```

`--score 0.60` sets both review thresholds to `0.60`. `--reworks 1` permits one rework before the final verdict:

- `BLOCKED` when a crash or unresolved HIGH/CRITICAL vulnerability remains.
- `FAILED` for a non-critical gate failure after budget exhaustion.

Use `--mode quick` only when skipping review and memory is intentional. Quick mode marks features complete without reviewer calls. It still deploys unless `--skip-deploy` is present.

## Scenario 5 — Deep refinement

```bash
hrns run \
  --reset \
  --mode deep_thinking \
  --scope "Introduce tenant-aware authorization across the API, workers, and admin UI without breaking existing clients." \
  --path ./api \
  --path ./workers \
  --path ./web \
  --skip-deploy
```

`deep_thinking` forces HIGH-complexity planning and enables the interactive REFINEMENT questionnaire. Use it for ambiguous requirements, cross-domain changes, migrations, and compatibility-sensitive work.

## Scenario 6 — Resume after interruption or timeout

```bash
hrns run --resume --mode thinking --skip-deploy
```

Resume loads `SCOPE.md` and state from `docs/product/`. It uses persisted `currentPhase` and `activeFeatureId` when valid.

Always repeat runtime safety flags such as `--skip-deploy` on the resumed command.

For a correction:

```bash
hrns run \
  --resume \
  --mode thinking \
  --steering "rollback to DEVELOPMENT and use the existing repository abstraction" \
  --skip-deploy
```

For most runners, `SteeringAnalyzer` converts the message into validated actions:

- `add_rule`
- `rollback` to `BOOTSTRAP`, `PLANNING`, `DEVELOPMENT`, `REVIEW`, or `MEMORY`
- `override_score`

With `antigravity-cli`, resume steering is added directly as a global rule. It does not perform structured rollback or score override parsing.

## Manual state edits

Stop the active process before editing state files.

| File | Owns |
| --- | --- |
| `docs/product/SCOPE.md` | Original project scope |
| `docs/product/BACKLOG.md` | Feature order, dependencies, scores, reworks, and status |
| `docs/product/DEVELOPMENT-STATE.md` | Task state |
| `docs/product/DECISIONS.md` | Transition and verdict audit log |
| `docs/product/BOOTSTRAP-CONFIG.json` | Paths, thresholds, current phase, active feature, and steering |

Prefer a resume steering action for rollback because it also resets active feature tasks when returning to `PLANNING` or `DEVELOPMENT`.

If manually adding a feature, keep the current backlog schema:

```markdown
| ID | Title | Domain | Agent | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F003 | Rate limiting | rate_limiting | backend | 3 | F001 | 0 | - | - | NOT_STARTED |
```

Valid `Agent` values are `backend`, `frontend`, `qa`, and `devops`. Use a unique sequential ID and valid dependency IDs. Manual state edits can create illegal transitions; update related files consistently.

## Review outcomes

| Outcome | Meaning | Next action |
| --- | --- | --- |
| `COMPLETED` | Gates passed, or review was explicitly skipped | Transition to next feature |
| `RETRY` | Gate failed with rework budget remaining | Write `REWORK-LOG.md`, reset tasks, return to development |
| `FAILED` | Budget exhausted; no crash or unresolved HIGH/CRITICAL vulnerability | Continue unrelated work; retain debt for audit |
| `BLOCKED` | Budget exhausted with crash or unresolved HIGH/CRITICAL vulnerability | Block dependents and require intervention |

`RETRY` is a gate verdict, not a persisted feature status.

## Inspect progress and cost

```bash
hrns report
hrns report --export json
hrns report --export csv --output ./reports/harness.csv
```

Also inspect `BACKLOG.md` and `DECISIONS.md`. A final `HALTED` state does not prove every feature passed or every deploy operation succeeded.

## Diagnose and optimize sessions

Each successful agent invocation appends a pending record to `docs/product/diagnose-sessions.jsonl`.

```bash
hrns diagnose
```

Diagnosis processes all pending records in batches of `3` by default. Override batch size when useful:

```bash
hrns diagnose --batch-size 6
```

The diagnosis adapter asks `harness-evaluator` to update the Pareto report when trace count is a positive multiple of `6`. After pending sessions are processed, it invokes meta-harness candidate proposal. The meta-harness skill requires at least `3` traces.

Review candidates:

```bash
hrns candidate list
hrns candidate review v001
```

Autonomous application is also available:

```bash
hrns candidate review v001 --auto
```

Inspect `rationale.md`, `diff.md`, and candidate `SKILL.md` before using `--auto` when change control matters.

## Supported runners

```text
antigravity-cli
claude-cli
claude-sdk
codex-cli
copilot-cli
copilot-sdk
cursor-cli
cursor-sdk
kiro-cli
opencode-cli
```

Example:

```bash
hrns run \
  --agent codex-cli \
  --model <runner-supported-model> \
  --effort high \
  --resume \
  --mode thinking \
  --skip-deploy
```

Model and effort support depend on the runner. Use `.harness-kit/settings.json` for per-runner and per-phase defaults.

## Quick reference

| Goal | Command |
| --- | --- |
| Interactive setup | `hrns init` |
| Safe reviewed reset | `hrns run --reset --mode thinking --scope "..." --path ./app --skip-deploy` |
| Safe resume | `hrns run --resume --mode thinking --skip-deploy` |
| Fast reviewed run | `hrns run --reset --mode fast --scope "..." --path ./app --skip-deploy` |
| Deep refinement | `hrns run --reset --mode deep_thinking --scope "..." --path ./app --skip-deploy` |
| Add runtime steering | `hrns run --resume --mode thinking --steering "..." --skip-deploy` |
| Skip review | Add `--skip-validation` |
| Skip memory | Add `--skip-memory` |
| Allow normal deploy phase | Omit `--skip-deploy` only with explicit authorization |
| Status and token report | `hrns report` |
| Diagnose pending sessions | `hrns diagnose` |
| List optimization candidates | `hrns candidate list` |
| Manage runner settings | `hrns settings` |

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Scope or paths missing on resume | `SCOPE.md` and `BOOTSTRAP-CONFIG.json.projectPaths` |
| Planning repeats | Required `004-*-test-scenarios.md` and ordered task JSON in tactical design |
| Development does not advance | Matching `TDD-OUTPUT.json`, `SUCCESS`, zero failed tests |
| Review retries | `TL.json`, `QA.json`, and `REWORK-LOG.md` |
| Dependents become blocked | A dependency received `BLOCKED` and cascade propagated |
| Diagnosis reports no pending sessions | `diagnose-sessions.jsonl` has no pending records |
| Candidate is not created | Fewer than `3` traces, stale/missing frontier, or no significant evidence-backed improvement |
| Deploy rejects a project after sensitive-file check | Add the file to `.gitignore`, review the unstaged changes, then rerun only when authorized |

## Further reading

- [README — installation, commands, flags, and runners](../README.md)
- [AGENTS.md — SDK development rules](../AGENTS.md)
- [Steering internals](./feature/sdk_steering.md)
- [CLI internals](./feature/sdk_cli.md)
- [State persistence](./adr/STATE-PERSISTENCE.md)
