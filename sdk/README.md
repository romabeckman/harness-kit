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

| Command / Option | Description | Example |
|---|---|---|
| `hrns run` | Start or resume an orchestration session (interactive). | `hrns run` |
| `hrns run --agent <type>` / `-a <type>` | Specify the agent type (e.g., `copilot-sdk`, `antigravity-cli`). | `hrns run --agent copilot-sdk` |
| `hrns run --model <name>` / `-m <name>` | Specify the model name for the agent. | `hrns run --model gpt-4o` |
| `hrns run --copilot-sdk` | Run with the Copilot agent. | `hrns run --copilot-sdk` |
| `hrns run --gemini` | Run with the Antigravity CLI (Gemini) agent. | `hrns run --gemini` |
| `hrns run --complexity <val>` / `-c <val>` | Force Phase A complexity: `SIMPLE`/`S` or `COMPLEX`/`C`. Omit for `AUTO` (agent decides). | `hrns run --complexity S` |
| `hrns report` | Print token usage report for the current session. | `hrns report` |
| `hrns version` / `--version` / `-v` | Show version. | `hrns version` |
| `hrns help` / `--help` / `-h` | Show help message. | `hrns help` |

> [!NOTE]
> The model specified via `--model` depends on what is supported by the chosen agent. Verify compatibility beforehand.

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

## Agent runner — pluggable strategies

The SDK supports multiple built-in coding agents:
- **Claude Code CLI** (`claude-cli`)
- **Anthropic API** (`claude-sdk`)
- **Google Antigravity** (`antigravity-cli`)

By default, the SDK auto-selects a runner:

| Condition | Runner used |
|---|---|
| `ANTHROPIC_API_KEY` set in environment | `claude-sdk` (direct API) |
| No API key | `claude-cli` (local `claude` CLI) |

Select agent strategy via CLI flags:
```bash
# Run with Google Antigravity CLI
hrns run --agent antigravity-cli

# Run with Copilot
hrns run --copilot-sdk

# Force SIMPLE classification for Phase A (skips 001/002 spec files)
hrns run --reset --scope "Fix login redirect bug" --path ./api --complexity S

# Force COMPLEX classification (generates all four spec files)
hrns run --reset --scope "Payment gateway integration" --path ./api -c COMPLEX
```

> [!NOTE]
> When `--complexity` is omitted, Phase A auto-classifies the scope based on the steering rules (default: `AUTO`). Use `SIMPLE` for isolated bug fixes or minor enhancements; use `COMPLEX` for new features, cross-domain work, or external integrations.

Detailed runner architectural specifications are located in [**sdk_agent_runner.md**](./docs/feature/sdk_agent_runner.md).
Detailed specifications for agent invocations during orchestration are in [**AGENTS.md**](./AGENTS.md).

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
})

await orchestrator.run()
orchestrator.tokenReport() // print token + cost breakdown
```

### Resume a previous session

```typescript
// same config + same projectPaths → resumes automatically
const orchestrator = new HarnessOrchestrator({
  scope: 'my project',       // ignored when backlog already exists on disk
  projectPaths: ['/path/to/api'],
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
  agentRunner: new ClaudeCLIRunner({
    onProgress: (line: ProgressLine) => {
      if (line.type === 'tool_use') console.log(`[${line.skill}] → ${line.toolName}`)
      if (line.type === 'result')   console.log(`[${line.skill}] done`)
    },
  }),
})
```

### Pluggable agent strategies

Instantiate any registered runner (e.g. Antigravity) via the Factory:

```typescript
import { HarnessOrchestrator, AgentRunnerFactory } from '@romabeckman/hrns'

const orchestrator = new HarnessOrchestrator({
  scope: 'my project',
  projectPaths: ['/path/to/project'],
  agentRunner: AgentRunnerFactory.create({
    type: 'antigravity-cli',
    model: 'gemini-3.5-flash',
  })
})
```

### Read backlog state

```typescript
import { FileStateManager } from '@romabeckman/hrns'

const state = new FileStateManager({ productDir: './docs/product' })

const features = state.loadBacklog()
const executable = state.getExecutableFeatures()
const nextTask = state.getNextTask('F001')
```

### CI/CD with API key

```typescript
import { HarnessOrchestrator, AgentRunnerFactory } from '@romabeckman/hrns'

const orchestrator = new HarnessOrchestrator({
  scope: 'my project',
  projectPaths: ['/path/to/project'],
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
