# @romabeckman/hk

![alpha](https://img.shields.io/badge/status-alpha-orange)

Runs the [harness-kit](https://github.com/romabeckman/harness-kit) autonomous orchestrator programmatically. Instead of typing `/autonomous-orchestrator` in Claude Code, you run a single command and the full TDD loop executes unattended — scope in, backlog built, agents delegated, validation scored, memory persisted.

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

### Option A — npx (no install, always latest)

```bash
npx @romabeckman/hk run
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

Then from any project directory:

```bash
@romabeckman/hk run
```

---

### Option C — run directly without installing

```bash
git clone https://github.com/romabeckman/harness-kit.git
cd harness-kit/sdk
npm install && npm run build
node dist/cli/run.js
```

---

## What happens when you run it

An interactive form collects the required info:

```
@romabeckman/hk — autonomous orchestrator

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

@romabeckman/hk — token report
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

## Agent runner — how authentication works

No API key needed for local use. The SDK uses your Claude Code session automatically.

| Condition | Runner used |
|---|---|
| `ANTHROPIC_API_KEY` set in environment | `ClaudeAgentRunner` (direct API) |
| No API key | `ClaudeCodeRunner` (local `claude` CLI) |

For CI/CD environments without Claude Code:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
@romabeckman/hk run
```

---

## Using the SDK programmatically

Install as a dependency in your project:

```bash
npm install @romabeckman/hk
# or, before publishing:
npm install /path/to/harness-kit/sdk
```

Basic usage:

```typescript
import { HarnessOrchestrator } from '@romabeckman/hk'

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
import { HarnessOrchestrator, ClaudeCodeRunner } from '@romabeckman/hk'
import type { ProgressLine } from '@romabeckman/hk'

const orchestrator = new HarnessOrchestrator({
  scope: 'my project',
  projectPaths: ['/path/to/project'],
  agentRunner: new ClaudeCodeRunner({
    onProgress: (line: ProgressLine) => {
      if (line.type === 'tool_use') console.log(`[${line.skill}] → ${line.toolName}`)
      if (line.type === 'result')   console.log(`[${line.skill}] done`)
    },
  }),
})
```

### Read backlog state

```typescript
import { FileStateManager } from '@romabeckman/hk'

const state = new FileStateManager({ productDir: './docs/product' })

const features = state.loadBacklog()
const executable = state.getExecutableFeatures()
const nextTask = state.getNextTask('F001')
```

### CI/CD with API key

```typescript
import { HarnessOrchestrator, ClaudeAgentRunner } from '@romabeckman/hk'

const orchestrator = new HarnessOrchestrator({
  scope: 'my project',
  projectPaths: ['/path/to/project'],
  agentRunner: new ClaudeAgentRunner(), // reads ANTHROPIC_API_KEY from env
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
