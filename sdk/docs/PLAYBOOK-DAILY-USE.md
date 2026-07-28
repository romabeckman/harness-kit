# Playbook — Daily Use

Practical recipes for common `hrns` workflows. Each scenario describes a real situation, the CLI commands to handle it, and the files you will touch.

> [!TIP]
> Read the [README](../README.md) first for installation, CLI flags, and phase overview. This playbook assumes you already have `hrns` available.

---

## Table of Contents

- [Scenario 1 — Multi-Project with a Read-Only Reference](#scenario-1--multi-project-with-a-read-only-reference)
- [Scenario 2 — Synchronized Frontend + Backend](#scenario-2--synchronized-frontend--backend)
- [Scenario 3 — Quick POC with Relaxed Scoring](#scenario-3--quick-poc-with-relaxed-scoring)
- [Scenario 4 — Mid-Run Corrections (Manual Edits)](#scenario-4--mid-run-corrections-manual-edits)

---

## Scenario 1 — Multi-Project with a Read-Only Reference

**Situation:** You have two projects — your application codebase where all development happens, and a template repository (downloaded from ChatGPT, a boilerplate, etc.) that should only be used as a **read-only reference**. The agents must never modify files in the template.

### Setup

```
workspace/
├── my-mcp-server/        ← your project (read-write)
└── mcp-template/         ← reference template (read-only)
```

### Step 1 — Initialize with both paths

```bash
hrns init
```

When the wizard asks for project directories, list both:

```
? Project paths: ./my-mcp-server, ./mcp-template
```

Or skip the wizard entirely:

```bash
hrns run \
  --reset \
  --scope "Build an MCP server for database introspection following the mcp-template patterns" \
  --path ./my-mcp-server \
  --path ./mcp-template
```

### Step 2 — Add a global steering rule

The key constraint is a **global steering rule** that tells every agent to treat the template as read-only. Add it via CLI:

```bash
hrns run \
  --reset \
  --scope "Build an MCP server for database introspection following the mcp-template patterns" \
  --path ./my-mcp-server \
  --path ./mcp-template \
  --steering "NEVER modify, create, or delete any file inside the mcp-template/ directory. Use it only as a read-only reference for patterns, structure, and conventions."
```

Or add it during `hrns init` when the steering wizard asks for **Global rules**:

```
? Global steering rules (applied to all phases):
  NEVER modify, create, or delete any file inside the mcp-template/ directory. Use it only as a read-only reference for patterns, structure, and conventions.
```

### Step 3 — Verify in BOOTSTRAP-CONFIG.json

After initialization, confirm the rule is persisted:

```json
// docs/product/BOOTSTRAP-CONFIG.json
{
  "steeringRules": {
    "user": [
      "NEVER modify, create, or delete any file inside the mcp-template/ directory. Use it only as a read-only reference for patterns, structure, and conventions."
    ]
  }
}
```

The `user` key means this rule is injected into **every** phase payload — bootstrap, planning, implementation, and validation all see it.

### Why this works

- The orchestrator passes `projectPaths` to every agent, giving them filesystem access to both directories.
- The global steering rule acts as a hard constraint in every prompt. Agents read the template for patterns but write exclusively to `my-mcp-server/`.
- If a validation agent flags a pattern mismatch, the implementation agent can look at the template for reference during rework — without touching it.

---

## Scenario 2 — Synchronized Frontend + Backend

**Situation:** A standard full-stack project — a backend API and a frontend SPA. You want the orchestrator to plan and implement features across both codebases in a coordinated way.

### Setup

```
workspace/
├── api/       ← Node.js / Express backend
└── web/       ← React / Vue / Angular frontend
```

### Step 1 — Provide both paths and a clear scope

```bash
hrns run \
  --reset \
  --scope "User management module: REST API with JWT authentication (api/) and React admin dashboard with login, user list, and role management (web/). The frontend consumes the backend API." \
  --path ./api \
  --path ./web
```

> [!IMPORTANT]
> Mention **both projects** in the scope text and clarify their relationship. The bootstrap agent uses this to split features correctly and understand cross-project dependencies.

### Step 2 — Leverage the feature dependency graph

The bootstrap agent (`software-architect`) will generate a `BACKLOG.md` that respects natural dependencies. A typical output looks like:

```markdown
| ID      | Feature                           | Priority | Status      | Depends On |
|---------|-----------------------------------|----------|-------------|------------|
| **F001** | JWT Auth Middleware (api/)        | 1        | NOT_STARTED |            |
| **F002** | User CRUD Endpoints (api/)       | 2        | NOT_STARTED | F001       |
| **F003** | Login Page + Auth Context (web/) | 3        | NOT_STARTED | F001       |
| **F004** | User Management Dashboard (web/) | 4        | NOT_STARTED | F002, F003 |
```

The orchestrator processes features in dependency order: `F001 → F002 → F003 → F004`. A backend API endpoint is always built and validated before the frontend that consumes it.

### Step 3 — Add phase-specific steering rules (optional)

For tighter control, add steering rules that apply only to specific phases:

```json
// docs/product/BOOTSTRAP-CONFIG.json
{
  "steeringRules": {
    "user": [
      "The api/ directory is a Node.js + Express project. The web/ directory is a React + TypeScript project."
    ],
    "implementation": [
      "When implementing API endpoints in api/, always create corresponding TypeScript interfaces in web/src/types/ so the frontend can consume them type-safely.",
      "Run tests for both projects: 'cd api && npm test' and 'cd web && npm test'."
    ]
  }
}
```

### Why this works

- Listing both `--path` entries gives agents full read-write access to both codebases.
- The scope describes the relationship between projects, so the architect agent creates features that span both or respect dependencies.
- Phase B (TDD implementation) sees both project trees and can write to both in a single feature cycle.
- Phase C (validation) reviews code across both directories for consistency.

---

## Scenario 3 — Quick POC with Relaxed Scoring

**Situation:** You need to build a proof-of-concept for a client presentation. The scope is detailed (you used ChatGPT / Gemini / Claude to help refine the PRD), and you want the orchestrator to be **more permissive** — accepting implementations faster without strict code review cycles.

### Step 1 — Refine the scope externally

Before running `hrns`, use your preferred chat tool (ChatGPT, Gemini, Claude) to refine the product requirements:

1. Describe the client's needs conversationally.
2. Ask the LLM to produce a structured PRD with user stories, acceptance criteria, and technical constraints.
3. Copy the final PRD text.

### Step 2 — Pass the full scope as text

For long scope text, use `hrns init` and paste into the editor, or pass it inline:

```bash
hrns run \
  --reset \
  --path ./poc-project \
  --score 0.6 \
  --reworks 1 \
  --scope "
## POC: Real-Time Analytics Dashboard for Acme Corp

### Context
Acme Corp needs a real-time dashboard prototype that visualizes sales pipeline metrics.
This is a POC for the Q3 board meeting — not production code.

### Features
1. WebSocket connection to receive mock sales events
2. Dashboard with 4 KPI cards (revenue, deals, conversion rate, avg deal size)
3. Real-time line chart showing revenue over the last 24 hours
4. Filter by region (NA, EMEA, APAC)

### Technical Constraints
- React + TypeScript frontend
- Node.js + Express + ws backend
- No database — in-memory data store is fine
- Mock data generator that simulates sales events

### Acceptance Criteria
- Dashboard updates in real-time without page refresh
- Charts render within 200ms of receiving a new event
- Region filter works without reconnecting the WebSocket
"
```

### Key flags explained

| Flag | Value | Why |
|---|---|---|
| `--score 0.6` | 60% acceptance threshold | The default is `0.7` (70%). Lowering to `0.6` means the validation agents (tech lead + adversarial QA) will pass implementations that score 6/10 or higher. For a POC, you accept "good enough" code. |
| `--reworks 1` | 1 rework cycle max | The default is `2`. With `1`, a feature gets one chance at rework before being marked BLOCKED. This speeds up the pipeline at the cost of polish. |

### Step 3 — Add POC-specific steering rules

```bash
hrns run \
  --reset \
  --path ./poc-project \
  --score 0.6 \
  --reworks 1 \
  --scope "..." \
  --steering "This is a proof-of-concept, not production code. Prioritize speed and working demos over code quality, error handling, and edge cases."
```

Or add granular rules directly in `BOOTSTRAP-CONFIG.json`:

```json
{
  "steeringRules": {
    "user": [
      "This is a proof-of-concept. Prioritize working demos over production quality."
    ],
    "review": [
      "Be lenient on error handling, logging, and edge-case coverage. Focus review on whether the feature works end-to-end.",
      "Do not fail a feature for missing input validation or incomplete error messages."
    ]
  }
}
```

### Why this works

- A low `--score` tells Phase D (completion gate) to pass features with lower review scores — the 6/10 threshold avoids endless rework loops on a throwaway prototype.
- `--reworks 1` caps the B↔C cycle, so the pipeline moves forward quickly.
- The POC steering rule makes Phase C reviewers focus on "does it work?" rather than "is it production-ready?".
- Long, detailed scope text gives the bootstrap agent enough context to produce a well-structured backlog, even without interactive refinement.

---

## Scenario 4 — Mid-Run Corrections (Manual Edits)

**Situation:** The orchestrator is running and you realize something needs to change — maybe a feature is missing from the backlog, a steering rule is needed only for implementation, or the current phase should be rolled back. You need to interrupt, edit state files manually, and resume.

### When to intervene

- A feature is missing from `BACKLOG.md` and you want to add it.
- The implementation agent is going in the wrong direction and needs a new constraint.
- You want to skip validation and force a feature back to implementation.

### Step 1 — Stop the orchestrator

Press `Ctrl+C` to stop the running session. The orchestrator persists its state to disk on every phase transition, so your progress is safe.

### Step 2 — Edit BOOTSTRAP-CONFIG.json

Open `docs/product/BOOTSTRAP-CONFIG.json` and make your changes:

#### Add a rule only for implementation (Phase B)

```json
{
  "steeringRules": {
    "implementation": [
      "Always validate request bodies using Zod schemas before processing.",
      "Use repository pattern for database access — never call the ORM directly from route handlers."
    ]
  }
}
```

> [!NOTE]
> Rules in `implementation` are only injected into implementation agent payloads. Bootstrap, planning, and validation agents never see them.

#### Rollback the current phase to implementation

Change `currentPhase` to force the orchestrator back to a specific phase:

```json
{
  "currentPhase": "DEVELOPMENT"
}
```

> [!WARNING]
> When you manually roll back to `DEVELOPMENT` or `PLANNING`, the orchestrator will **not** automatically reset task statuses. You may need to also edit `DEVELOPMENT-STATE.md` to set task statuses back to `NOT_STARTED`. Alternatively, use the steering prompt when resuming to trigger a proper rollback.

### Step 3 — Edit BACKLOG.md (add a missing feature)

If you discover a missing feature, add a new row to `docs/product/BACKLOG.md`:

```markdown
| ID       | Feature                            | Priority | Status      | Depends On | Score (TL) | Score (Adv) | Reworks |
|----------|------------------------------------|----------|-------------|------------|------------|-------------|---------|
| **F001** | JWT Auth Middleware                 | 1        | COMPLETED   |            | 9          | 8           | 0       |
| **F002** | User CRUD Endpoints                | 2        | IN_PROGRESS | F001       |            |             | 0       |
| **F003** | Rate Limiting Middleware           | 3        | NOT_STARTED | F001       |            |             | 0       |
```

Rules for manually adding features:

1. **ID format**: Use the next sequential ID (e.g., `F003` if `F002` exists). Wrap in bold: `**F003**`.
2. **Status**: Set to `NOT_STARTED`.
3. **Dependencies**: List feature IDs that must complete first. The orchestrator skips features whose dependencies are not `COMPLETED`.
4. **Priority**: Assign a numeric priority. Lower numbers run first (among features with satisfied dependencies).
5. **Score columns**: Leave empty for new features.
6. **Reworks**: Set to `0`.

### Step 4 — Resume the session

```bash
hrns run --resume
```

The orchestrator reads the updated state files and continues from the phase you set. If you want to add a steering rule **at resume time** without editing files:

```bash
hrns run --resume --steering "Focus F002 implementation on input validation with Zod"
```

### Alternative — Use the interactive steering prompt

Instead of editing files manually, you can use the interactive steering prompt when resuming:

```bash
hrns run
# Select: Resume
# Steering message: "rollback to implementation, add rule: use Zod for all request validation"
```

The `SteeringAnalyzer` will parse your natural language into structured actions:

```json
[
  { "type": "rollback", "targetPhase": "DEVELOPMENT" },
  { "type": "add_rule", "rule": "use Zod for all request validation" }
]
```

This is the **preferred approach** for rollbacks because it automatically resets task statuses to `NOT_STARTED`, which manual file edits do not.

### Why this works

- The orchestrator's state is entirely file-based (`BACKLOG.md`, `DEVELOPMENT-STATE.md`, `BOOTSTRAP-CONFIG.json`). You can edit any of them between runs.
- `--resume` reads the current state from disk — it does not rely on in-memory state from the previous session.
- Phase-scoped steering rules (`implementation`, `review`, etc.) give fine-grained control over specific agents without affecting others.
- The `SteeringAnalyzer` handles natural-language rollback instructions, saving you from manual file surgery.

---

## Quick Reference — Common Flag Combinations

| Goal | Command |
|---|---|
| Start fresh with full scope | `hrns run --reset --scope "..." --path ./src` |
| Resume where you left off | `hrns run --resume` |
| Resume with a new rule | `hrns run --resume --steering "prefer async/await"` |
| POC mode (fast, permissive) | `hrns run --reset --score 0.6 --reworks 1 --scope "..."` |
| Multi-project | `hrns run --reset --path ./api --path ./web --scope "..."` |
| Read-only reference project | Add `--steering "NEVER modify files in <dir>/"` |
| Specific agent runner | `hrns run --agent antigravity-cli` |
| Specific model | `hrns run --model claude-opus-4-8` |

---

## Further Reading

- [README — CLI flags and phase overview](../README.md)
- [AGENTS.md — Agent invocation reference](../AGENTS.md)
- [sdk_steering — Steering analyzer internals](./feature/sdk_steering.md)
- [sdk_cli — CLI commands and arg parsing](./feature/sdk_cli.md)
- [adr/STATE-PERSISTENCE — File state manager](./adr/STATE-PERSISTENCE.md)
