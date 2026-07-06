# @romabeckman/hrns

![beta](https://img.shields.io/badge/status-beta-blue)

Runs the [harness-kit](https://github.com/romabeckman/harness-kit) autonomous orchestrator programmatically. Instead of typing `/autonomous-orchestrator` in Claude Code, you run a single command and the full TDD loop executes unattended — scope in, backlog built, agents delegated, validation scored, memory persisted.

---

## How the orchestration works

The orchestrator drives a feature through a fixed pipeline of phases. Each phase hands off to the next; failures trigger rework or cascade-blocking rather than silent skips.

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │                         Project Scope                                │
  └──────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Bootstrap  ·  software-architect agent                              │
  │  Parses scope → writes BACKLOG.md with features, layers, priorities  │
  └──────────────────────────────┬───────────────────────────────────────┘
                                 │  (for each feature)
                                 ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Phase A  ·  scope-refinement skill                                  │
  │  Writes spec files (user stories, tactical design, test scenarios)   │
  │  Extracts task list into DEVELOPMENT-STATE.md                        │
  └──────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Phase B  ·  tdd-orchestrator skill                                  │
  │  Implements tasks in strict TDD order (red → green → refactor)       │
  │  Each task must pass its tests before the next begins                │
  └──────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Phase C  ·  the-grumpy-tech-lead + adversarial-qa skills            │
  │  Code review scores implementation quality (0–10)                    │
  │  QA agent hunts security vulnerabilities and missing edge cases      │
  │  Scores below threshold → feature returns to Phase B (rework)        │
  └──────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Phase D  ·  completion gate (no agent)                              │
  │  Checks all features meet score thresholds and rework limits         │
  │  Violations are logged to DECISIONS.md                               │
  └──────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Phase E  ·  project-memory skill                                    │
  │  Persists learnings, decisions, and patterns to long-term memory     │
  └──────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Phase F  ·  transition (no agent)                                   │
  │  Advances to next NOT_STARTED feature, or cascades BLOCKED status    │
  │  to dependents. When all features are done → HALTED                  │
  └──────────────────────────────┬───────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
             next feature               all done
          (loops to Phase A)           (session end)
```

> Phases B → C loop per rework. A feature can cycle back from C to B up to `maxReworks` times before being marked BLOCKED. BLOCKED features cascade to dependents; FAILED features do not.

---

## Integration with Superpowers

HarnessKit is designed to complement [Superpowers Skills](https://github.com/obra/superpowers). While HarnessKit defines the *strategy and discipline* (what to build and how to validate it), Superpowers provides the low-level *execution tools* (Git worktrees, parallel agents, etc.).

---

## Prerequisites

Before anything else:

```bash
# 1. Claude Code CLI installed and authenticated
claude --version

# 2. harness-kit plugin installed
/plugin marketplace add romabeckman/harness-kit
```

---

## How to run

### Option A — npx (available soon)

```bash
npx @romabeckman/hrns run
```

> If the package is not yet published to npm, use Option B or C below.

---

### Option B — install globally (run from anywhere)

Build from source and install globally once:

```bash
git clone https://github.com/romabeckman/harness-kit.git
cd harness-kit/sdk
npm install
npm run build
npm install -g .
```

In Claude code:

```bash
cd ~/.claude/plugins/marketplaces/harness-kit/sdk
npm install
npm run build
npm install -g .
```

Then from any project directory:

```bash
hrns run
```

> To uninstall: `npm uninstall -g @romabeckman/hrns`

---

### Option C — run directly without installing

```bash
git clone https://github.com/romabeckman/harness-kit.git
cd harness-kit/sdk
npm install && npm run build
node dist/cli/run.js
```

---

## CLI Reference

### `hrns run` — start or resume an orchestration session

| Flag | Alias | Description | Example |
|---|---|---|---|
| `--agent <type>` | `-a` | Agent runner type (see table below) | `--agent copilot-sdk` |
| `--model <name>` | `-m` | Model override for all phases | `--model gpt-4o` |
| `--copilot-sdk` | | Shorthand for `--agent copilot-sdk` | |
| `--gemini` | | Shorthand for `--agent antigravity-cli` | |
| `--reset` | | Force reset action (skip interactive prompt) | |
| `--resume` | | Force resume action (skip interactive prompt) | |
| `--scope <text>` | | Project scope / PRD (skips editor prompt) | `--scope "REST API with JWT"` |
| `--path <dir>` | | Project directory (repeatable) | `--path ./api --path ./web` |
| `--score <0–1>` | | Acceptance score threshold | `--score 0.8` |
| `--reworks <1–10>` | | Max rework cycles before cascade fail | `--reworks 3` |
| `--steering <text>` | | Additional orchestration rules | `--steering "prefer async/await"` |
| `--complexity <val>` | `-c` | Phase A complexity: `SIMPLE`/`S`, `COMPLEX`/`C`, or omit for `AUTO` | `--complexity S` |
| `--debug` | | Enable debug output | |

### Other commands

| Command | Description |
|---|---|
| `hrns report` | Print token usage report for the current session |
| `hrns version` | Show version |
| `hrns help` | Show help message |

> [!NOTE]
> The model specified via `--model` overrides the default for all phases. Each agent runner has its own supported model list — verify compatibility beforehand. For per-phase model tuning, use `settings.json` instead.

---

## What happens when you run it

An interactive form collects the required info:

```
harness-kit — autonomous orchestrator

? What would you like to do?
  ❯ resume — continue from last session
    reset  — discard current session and start a new cycle

? How would you like to provide the project scope?
  ❯ type   — enter a short description
    editor — open editor for a longer PRD

? Project scope: REST API with JWT auth and PostgreSQL

? Project paths (comma-separated): /home/user/my-api

── Starting orchestration ──────────────────────────────
  scope:  REST API with JWT auth and PostgreSQL
  paths:  /home/user/my-api
────────────────────────────────────────────────────────
[scope-refinement] → Skill
[scope-refinement] → Write
[scope-refinement] ✓ done
[tdd-orchestrator] → Bash
...
✓ All features completed.

harness-kit — token report
────────────────────────────────────────
scope-refinement     input: 12,450  cost: $0.04
tdd-orchestrator     input: 28,100  cost: $0.12
────────────────────────────────────────
TOTAL                input: 40,550  cost: $0.16
```

- Real-time progress logged to the terminal as agents work
- `docs/product/BACKLOG.md`, `DEVELOPMENT-STATE.md`, `DECISIONS.md` updated continuously
- If interrupted, run the same command again and choose **resume** — it picks up exactly where it stopped
- Ctrl+C cancels cleanly at any prompt

---

## Agent runners — pluggable strategies

Each agent runner is a self-contained strategy that knows how to invoke a specific AI backend. The SDK ships seven built-in runners:

| Type | Binary / SDK | Default model | Notes |
|---|---|---|---|
| `claude-cli` | `claude` CLI | _(from settings)_ | Default when no `ANTHROPIC_API_KEY` is set |
| `claude-sdk` | `@anthropic-ai/sdk` | `claude-sonnet-4-6` | Default when `ANTHROPIC_API_KEY` is set |
| `antigravity-cli` | `agy` CLI | `gemini-3.5-flash` | Google Gemini via Antigravity |
| `copilot-cli` | `copilot` CLI | _(from settings)_ | GitHub Copilot CLI |
| `copilot-sdk` | `@github/copilot-sdk` | `gpt-5.3-codex` | GitHub Copilot SDK |
| `cursor-cli` | `agent` CLI | _(from settings)_ | Cursor CLI |
| `cursor-sdk` | `@cursor/sdk` | `composer-2.5` | Requires `CURSOR_API_KEY` env var |

### Auto-selection

| Condition | Runner used |
|---|---|
| `ANTHROPIC_API_KEY` set in environment | `claude-sdk` (direct API) |
| No API key | `claude-cli` (local `claude` CLI) |

### CLI shorthands

```bash
hrns run --agent antigravity-cli     # Google Gemini via Antigravity
hrns run --gemini                    # shorthand for the above
hrns run --copilot-sdk               # GitHub Copilot SDK
hrns run --agent cursor-sdk          # Cursor SDK (needs CURSOR_API_KEY)
hrns run --agent copilot-cli         # GitHub Copilot CLI
hrns run --agent cursor-cli          # Cursor CLI
```

Detailed runner architectural specifications are located in [**sdk_agent_runner.md**](./docs/feature/sdk_agent_runner.md).
Detailed specifications for agent invocations during orchestration are in [**AGENTS.md**](./AGENTS.md).

---

## Configuration — `settings.json`

`settings.json` lets you tune the model and timeout for each runner and phase without touching code. Changes apply immediately on the next run.

### File locations

The SDK reads settings from two places and deep-merges them (project overrides global):

| Scope | Path |
|---|---|
| **Global** (all projects) | `~/.config/harness-kit/settings.json` |
| **Project** (current project only) | `<projectPath>/.harness-kit/settings.json` |

The global file is created automatically on first run if it does not exist. You can also set `HARNESS_SETTINGS_PATH` to point to a custom path, or `XDG_CONFIG_HOME` to change the base config directory.

### Schema

```json
{
  "<runner-key>": {
    "timeoutMs": 1800000,
    "phases": {
      "<phase-key>": {
        "model": "claude-sonnet-4-6",
        "effort": "high",
        "timeoutMs": 3600000
      }
    }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `timeoutMs` | `number` | Default timeout (ms) for all phases under this runner |
| `phases.<key>.model` | `string` | Model to use for this specific phase |
| `phases.<key>.effort` | `string` | Reasoning effort: `low`, `medium`, `high` |
| `phases.<key>.timeoutMs` | `number` | Phase-level timeout override (takes precedence over runner-level) |

### Runner keys

| Key | Applies to |
|---|---|
| `claude` | `claude-cli` and `claude-sdk` runners |
| `antigravity` | `antigravity-cli` runner |
| `copilot` | `copilot-cli` and `copilot-sdk` runners |
| `cursor` | `cursor-cli` and `cursor-sdk` runners |

### Phase keys

| Key | Phase |
|---|---|
| `bootstrap` | Bootstrap — software-architect agent |
| `phase_a` | Phase A — scope-refinement |
| `phase_b` | Phase B — tdd-orchestrator |
| `phase_c_tl` | Phase C — the-grumpy-tech-lead review |
| `phase_c_adv` | Phase C — adversarial-qa review |
| `phase_e` | Phase E — project-memory |

### Default settings

```json
{
  "claude": {
    "timeoutMs": 1800000,
    "phases": {
      "bootstrap":   { "model": "claude-sonnet-4-6", "effort": "low"    },
      "phase_a":     { "model": "claude-sonnet-4-6", "effort": "high"   },
      "phase_b":     { "model": "claude-sonnet-4-6", "effort": "medium" },
      "phase_c_tl":  { "model": "claude-sonnet-4-6", "effort": "low"    },
      "phase_c_adv": { "model": "claude-sonnet-4-6", "effort": "low"    },
      "phase_e":     { "model": "claude-sonnet-4-6", "effort": "low"    }
    }
  },
  "antigravity": {
    "timeoutMs": 1800000,
    "phases": {
      "bootstrap":   { "model": "gemini-3.5-flash" },
      "phase_a":     { "model": "gemini-3.5-flash" },
      "phase_b":     { "model": "gemini-3.5-flash" },
      "phase_c_tl":  { "model": "gemini-3.5-flash" },
      "phase_c_adv": { "model": "gemini-3.5-flash" },
      "phase_e":     { "model": "gemini-3.5-flash" }
    }
  },
  "copilot": {
    "timeoutMs": 1800000,
    "phases": {
      "bootstrap":   { "model": "gpt-5.3-codex",    "effort": "low"    },
      "phase_a":     { "model": "claude-sonnet-4-6", "effort": "high"   },
      "phase_b":     { "model": "gpt-5.3-codex",    "effort": "medium" },
      "phase_c_tl":  { "model": "gpt-5.3-codex",    "effort": "low"    },
      "phase_c_adv": { "model": "gpt-5.3-codex",    "effort": "low"    },
      "phase_e":     { "model": "gpt-5.3-codex",    "effort": "low"    }
    }
  },
  "cursor": {
    "timeoutMs": 1800000,
    "phases": {
      "bootstrap":   { "model": "gpt-5.3-codex",    "effort": "low"    },
      "phase_a":     { "model": "claude-sonnet-4-6", "effort": "high"   },
      "phase_b":     { "model": "gpt-5.3-codex",    "effort": "medium" },
      "phase_c_tl":  { "model": "gpt-5.3-codex",    "effort": "low"    },
      "phase_c_adv": { "model": "gpt-5.3-codex",    "effort": "low"    },
      "phase_e":     { "model": "gpt-5.3-codex",    "effort": "low"    }
    }
  }
}
```

### Example — upgrade Phase B to a more powerful model for a project

Create `.harness-kit/settings.json` inside your project root:

```json
{
  "claude": {
    "phases": {
      "phase_b": { "model": "claude-opus-4-8", "effort": "high" }
    }
  }
}
```

Only the fields you specify are overridden — everything else falls back to the global settings or defaults.

---

## Using the SDK programmatically

Install as a dependency in your project:

```bash
npm install @romabeckman/hrns
# or, before publishing:
npm install /path/to/harness-kit/sdk
```

Basic usage:

```typescript
import { HarnessOrchestrator } from '@romabeckman/hrns'

const orchestrator = new HarnessOrchestrator({
  scope: 'REST API with JWT auth and PostgreSQL',
  projectPaths: ['/path/to/my-api'],
  score: 0.7,    // minimum acceptance score (0–1)
  reworks: 3,    // max rework cycles before cascade-blocking
})

await orchestrator.run()
orchestrator.tokenReport() // print token + cost breakdown
```

### Resume a previous session

When a backlog already exists on disk, the orchestrator re-enters at the last persisted phase automatically. The `scope` field is still required by the type, but its value is overridden by the persisted scope on disk.

```typescript
const orchestrator = new HarnessOrchestrator({
  scope: '',   // overridden by persisted scope on disk
  projectPaths: ['/path/to/api'],
  score: 0.7,
  reworks: 3,
})

await orchestrator.run()
```

### Custom progress output

```typescript
import { HarnessOrchestrator, ClaudeCLIRunner } from '@romabeckman/hrns'
import type { ProgressLine } from '@romabeckman/hrns'

const orchestrator = new HarnessOrchestrator({
  scope: 'my project',
  projectPaths: ['/path/to/project'],
  score: 0.7,
  reworks: 3,
  agentRunner: new ClaudeCLIRunner({
    onProgress: (line: ProgressLine) => {
      if (line.type === 'tool_use') console.log(`[${line.skill}] → ${line.toolName}`)
      if (line.type === 'result')   console.log(`[${line.skill}] done`)
    },
  }),
})
```

### Pluggable agent strategies

Instantiate any registered runner via the Factory:

```typescript
import { HarnessOrchestrator, AgentRunnerFactory } from '@romabeckman/hrns'

const orchestrator = new HarnessOrchestrator({
  scope: 'my project',
  projectPaths: ['/path/to/project'],
  score: 0.7,
  reworks: 3,
  agentRunner: AgentRunnerFactory.create({
    type: 'antigravity-cli',
    model: 'gemini-3.5-flash',
  }),
})
```

### Custom chain

By default the orchestrator uses `ChainBuilder.buildDefault()`, which wires all phases in order. Pass a `chain` to replace or extend it:

```typescript
import {
  HarnessOrchestrator,
  ChainBuilder,
  PhaseAHandler,
  PhaseBHandler,
  PhaseCHandler,
  PhaseDHandler,
  PhaseEHandler,
  PhaseFHandler,
  CascadeBlockedHandler,
} from '@romabeckman/hrns'

const chain = new ChainBuilder()
  .addPhaseA(new PhaseAHandler())
  .addPhaseB(new PhaseBHandler())
  .addPhaseC(new PhaseCHandler())
  .addPhaseD(new PhaseDHandler())
  .addPhaseE(new PhaseEHandler())
  .addPhaseF(new PhaseFHandler())
  .addCascadeBlocked(new CascadeBlockedHandler())
  .build()

const orchestrator = new HarnessOrchestrator({
  scope: 'my project',
  projectPaths: ['/path/to/project'],
  score: 0.7,
  reworks: 3,
  chain,
})
```

### Read backlog state

```typescript
import { FileStateManager } from '@romabeckman/hrns'

const state = new FileStateManager({ productDir: './docs/product' })

const features = state.loadBacklog()
const executable = state.getExecutableFeatures()
```

### CI/CD with API key

```typescript
import { HarnessOrchestrator, AgentRunnerFactory } from '@romabeckman/hrns'

const orchestrator = new HarnessOrchestrator({
  scope: 'my project',
  projectPaths: ['/path/to/project'],
  score: 0.7,
  reworks: 3,
  agentRunner: AgentRunnerFactory.create({ type: 'claude-sdk' }), // reads ANTHROPIC_API_KEY from env
})

await orchestrator.run()
```

---

## Token report

After each run, `docs/product/tokens.jsonl` is written with one entry per agent invocation.
Call `tokenReport()` to print a summary:

```typescript
orchestrator.tokenReport()
```

```
harness-kit-sdk — token report
  model:  anthropic.claude-4-6-sonnet, anthropic.claude-4-5-haiku
────────────────────────────────────────────────────────────────────
skill                           input   output  cache_r  cost
────────────────────────────────────────────────────────────────────
harness-kit:autonomous-orchestrator:bootstrap        5      586   81,124  $0.2267
scope-refinement                2,759   14,806  793,672  $2.9909
tdd-orchestrator                1,274   16,776 1,962,417  $2.8600
the-grumpy-tech-lead               57    3,372  287,236  $0.5543
adversarial-qa                     57    3,323  323,149  $0.3755
project-memory                     13    4,684  240,743  $0.7567
────────────────────────────────────────────────────────────────────
TOTAL                           4,165   43,547 3,688,341  $7.7640
  cache_read saved ~$11.0650
```

---

## Build from source

```bash
cd harness-kit/sdk
npm install
npm run build      # compiles TypeScript → dist/
npm test           # runs Vitest (250+ tests)
npm run typecheck  # zero-error type check
```

---

## Repository

[github.com/romabeckman/harness-kit](https://github.com/romabeckman/harness-kit)
