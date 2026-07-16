# sdk_cli — Harness Kit CLI

The CLI module provides the `hrns` command-line interface for launching and managing orchestration sessions. It delegates execution to `HarnessOrchestrator` after resolving all runtime options.

---

## ENTRY POINTS

| File | Description |
|---|---|
| `src/cli/run.ts` | Main CLI binary. Dispatches to service functions based on `<command>`. |
| `src/cli/services/run-service.ts` | `cmdRun()` — resolves options and starts an orchestration session. |
| `src/cli/services/init-service.ts` | `cmdInit()` — interactive wizard to initialize product files and steering rules. |
| `src/cli/services/reset-service.ts` | `resetOptions()` — interactive wizard to collect `ResetOptions`. |
| `src/cli/utils/run-args-parser.ts` | `parseRunArgs()` — pure, testable arg parser for all `run` flags. |
| `src/cli/utils/cli-utils.ts` | Path helpers: `expandPath()`, `resolveDirs()`, `validateDirs()`, `validateScope()`. |
| `src/cli/utils/constants.ts` | `HELP` string and shared constants (`DEFAULT_SCORE`, `DEFAULT_REWORKS`). |

---

## COMMANDS

```
hrns init      Initialize workspace files and configure steering rules
hrns run       Start or resume an orchestration session
hrns report    Print token usage report
hrns version   Show version
hrns help      Show help
```

---

## HRNS INIT — WORKSPACE INITIALIZATION WIZARD

The `hrns init` command prepares a directory for running Harness Kit cycles:

1. **Product File Creation**: Generates base files (`BACKLOG.md`, `DEVELOPMENT-STATE.md`, `DECISIONS.md`, and `BOOTSTRAP-CONFIG.json`) under `docs/product/`.
2. **Interactive Steering Wizard**: Prompts the developer phase-by-phase for custom steering rules (Global, Bootstrap, Planning, Implementation, Validation, and Steering).
3. **Local Settings Creation**: Prompts the developer to create a local `.harness-kit/settings.json` file if one does not already exist.
4. **Direct Execution Follow-up**: Offers to trigger `hrns run` immediately at the end. Passed CLI arguments (such as `--agent` or `--model`) are inherited, and `--reset` is appended alongside `cliCommand = CliCommand.INIT` to bypass the resume prompt and correctly sync the newly configured project scope.

---

## HRNS RUN — FLAGS REFERENCE

### Agent Runner

| Flag | Short | Description |
|---|---|---|
| `--agent <type>` | `-a` | Agent type (e.g. `claude-cli`, `copilot-sdk`, `antigravity-cli`, `gemini`) |
| `--model <name>` | `-m` | Model name forwarded to the agent runner |

### Action Selector

| Flag | Description |
|---|---|
| `--reset` | Force a new cycle (skips the interactive action prompt) |
| `--resume` | Resume from last saved session (skips the interactive action prompt) |

### Reset Options (skip interactive wizard when any is provided)

| Flag | Type | Default | Description |
|---|---|---|---|
| `--scope <text>` | string | — | Project scope / PRD |
| `--path <dir>` | string (repeatable) | `cwd` | Add a directory to `projectPaths`; each `--path` appends one item |
| `--score <0.1-1>` | float | `0.7` | Minimum acceptance score for a feature |
| `--reworks <1-10>` | int | `2` | Max rework cycles before cascade fail |
| `--steering <text>` | string | — | Additional orchestration rules |

> **Wizard bypass rule**: if _any_ of `--scope`, `--path`, `--score`, or `--reworks` is supplied, the interactive reset wizard is skipped entirely. Missing fields fall back to defaults.

### Resume Options

| Flag | Description |
|---|---|
| `--steering <text>` | Steering message applied before the resumed run (skips interactive prompt) |

---

## ARG PARSING — PARSERUNARGS()

`parseRunArgs(args: string[]): ParsedRunArgs`

A pure function (no side effects, no I/O) that converts the raw `string[]` received after the `run` command into a typed `ParsedRunArgs` object. Used by `cmdRun()` to determine which interactive prompts to skip.

```ts
interface ParsedRunArgs {
  agentType?: string
  model?: string
  action?: 'reset' | 'resume'
  scope?: string
  projectPaths: string[]   // always an array, empty when no --path given
  score?: number
  reworks?: number
  steeringMessage?: string
}
```

Unknown flags are silently ignored. `--score` is parsed with `parseFloat`; `--reworks` with `parseInt`.

---

## NON-INTERACTIVE (HEADLESS) USAGE EXAMPLES

```bash
# Full reset — no wizard prompts
hrns run \
  --reset \
  --scope "Implement the authentication module" \
  --path ./api \
  --path ./web \
  --score 0.9 \
  --reworks 3 \
  --steering "prefer functional style, avoid classes"

# Resume with a steering override — no prompts
hrns run --resume --steering "focus on security hardening"

# Reset with a specific agent and model
hrns run --reset --scope "Build REST API" --path ./src --agent claude-cli --model claude-3-7-sonnet
```

---

## INTERACTIVE FALLBACK BEHAVIOUR

When `--reset` or `--resume` is omitted and a `BACKLOG.md` exists, `cmdRun()` displays a `select` prompt. When none of the reset option flags are provided, the full interactive wizard (`resetOptions()`) is invoked.

---

## TESTS

| File | Suite | Count |
|---|---|---|
| `tests/unit/t19-run-args-parser.test.ts` | `T19 — parseRunArgs` | 21 |
| `tests/unit/t29-init-service.test.ts` | `T29 — cmdInit` | 5 |

All unit tests exercise either pure parsers or mocked prompt structures — no process I/O required.

---

## REFERENCES

- [**sdk_settings.md**](./sdk_settings.md): Settings and configuration resolver details for `HarnessSettings`.
- [**sdk_steering.md**](./sdk_steering.md): Orchestration phase steering rules details.
- [**sdk_core.md**](./sdk_core.md): Core `HarnessOrchestrator` lifecycle and phases.
