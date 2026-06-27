# Test Scenarios — SDK Package (F004)

Domain: `sdk_package`
Feature: npm package setup — build, types, publish config
Sources: `003-sdk-package-tactical-design.md`

---

## Overview

F004 has no new application logic to unit-test — it configures build and publish infrastructure. Tests for this feature are verification steps executed by the developer against real tool outputs. Each scenario below maps to a command-line verification that the developer must run and confirm.

All scenarios assume the working directory is `sdk/` unless otherwise noted.

---

## Scenario Group 1 — Build Correctness

### S01 — Clean build produces dist/ artifacts

**Given** `dist/` is deleted or empty
**When** `npm run build` is executed
**Then** exit code is `0`
**And** the following files exist:
- `dist/index.js`
- `dist/index.d.ts`
- `dist/index.js.map`
- `dist/index.d.ts.map`

**Verification command:**
```bash
rm -rf dist/ && npm run build && ls dist/
```

**Pass criteria:** Command chain exits 0; `ls dist/` shows `index.js`, `index.d.ts`, `index.js.map`, `index.d.ts.map` at minimum.

---

### S02 — Compiled output does not include test files

**Given** a successful build
**When** `dist/` contents are inspected
**Then** no files from `tests/` appear under `dist/`
**And** no Vitest types or imports appear in any `dist/*.d.ts` file

**Verification command:**
```bash
find dist/ -name "*.test.*" | wc -l
```

**Pass criteria:** Output is `0`.

---

### S03 — TypeScript strict check passes on public API

**Given** `tsconfig.json` with `strict: true`
**When** `npm run typecheck` is executed (`tsc --noEmit`)
**Then** exit code is `0`
**And** no `error TS` lines appear in stdout

**Verification command:**
```bash
npm run typecheck
```

**Pass criteria:** Exit code 0, empty stderr.

---

## Scenario Group 2 — Package Manifest Correctness

### S04 — package.json exports map resolves correctly

**Given** `package.json` with `exports: { ".": { "require": "./dist/index.js", "types": "./dist/index.d.ts" } }`
**When** a Node.js consumer executes `require('harness-kit-sdk')`
**Then** `dist/index.js` is loaded
**And** TypeScript resolves types from `dist/index.d.ts`

**Verification command (manual check):**
```bash
node -e "const sdk = require('./dist/index.js'); console.log(typeof sdk.HarnessOrchestrator)"
```

**Pass criteria:** Output is `function`.

---

### S05 — HarnessOrchestrator is importable from dist

**Given** a compiled `dist/index.js`
**When** `require('./dist/index.js')` is evaluated in Node
**Then** `HarnessOrchestrator`, `FileStateManager`, `ClaudeAgentRunner`, `NullAgentRunner` are all defined and are functions

**Verification command:**
```bash
node -e "
const sdk = require('./dist/index.js');
const required = ['HarnessOrchestrator', 'FileStateManager', 'ClaudeAgentRunner', 'NullAgentRunner'];
required.forEach(name => {
  if (typeof sdk[name] !== 'function') throw new Error(name + ' missing');
});
console.log('all exports present');
"
```

**Pass criteria:** Prints `all exports present`, exits 0.

---

### S06 — Enum exports are present and correct

**Given** a compiled `dist/index.js`
**When** enums are accessed
**Then** `Phase.BOOTSTRAP`, `Verdict.PASS`, `AgentRunnerErrorCode.MISSING_API_KEY` have their expected string values

**Verification command:**
```bash
node -e "
const sdk = require('./dist/index.js');
if (sdk.Phase.BOOTSTRAP !== 'BOOTSTRAP') throw new Error('Phase.BOOTSTRAP wrong');
if (sdk.Verdict.PASS !== 'PASS') throw new Error('Verdict.PASS wrong');
if (sdk.AgentRunnerErrorCode.MISSING_API_KEY !== 'MISSING_API_KEY') throw new Error('AgentRunnerErrorCode wrong');
console.log('enums correct');
"
```

**Pass criteria:** Prints `enums correct`, exits 0.

---

## Scenario Group 3 — Publish Gate

### S07 — npm pack includes dist/ and README.md only

**Given** `package.json` with `files: ["dist", "README.md"]`
**When** `npm pack --dry-run` is executed
**Then** the file list includes `dist/index.js`, `dist/index.d.ts`, `README.md`
**And** the file list excludes `src/`, `tests/`, `tsconfig.json`, `tsconfig.build.json`, `package-lock.json`, any file under `docs/`

**Verification command:**
```bash
npm pack --dry-run 2>&1
```

**Pass criteria:** All `dist/` files and `README.md` present; no `src/` or `tests/` entries visible.

---

### S08 — prepublishOnly script runs build then tests

**Given** `prepublishOnly: "npm run build && npm test"` in `package.json`
**When** `npm run prepublishOnly` is executed
**Then** `tsc -p tsconfig.build.json` runs first
**And** `vitest run` runs second
**And** both exit code 0
**And** the combined command exits 0

**Verification command:**
```bash
npm run prepublishOnly
```

**Pass criteria:** Exit code 0; no TypeScript errors; 225 Vitest tests pass.

---

### S09 — prepublishOnly fails if build fails

**Given** a deliberately broken import in `src/index.ts` (add `import { NonExistent } from './orchestrator/NonExistent'`)
**When** `npm run prepublishOnly` is executed
**Then** `tsc` exits non-zero
**And** `vitest run` does not execute (short-circuit via `&&`)
**And** overall exit code is non-zero

**Verification:** Conceptual — not executed in production, but the `&&` chain guarantees this behavior. Confirmed by inspection of the `prepublishOnly` script.

---

## Scenario Group 4 — Consumer Documentation

### S10 — README.md exists in sdk/

**Given** F004 is complete
**When** `sdk/README.md` is checked
**Then** the file exists
**And** contains `npm install harness-kit-sdk`
**And** contains a code block with `new HarnessOrchestrator(` or `HarnessOrchestrator`
**And** mentions `ANTHROPIC_API_KEY`

**Verification command:**
```bash
grep -c "harness-kit-sdk\|HarnessOrchestrator\|ANTHROPIC_API_KEY" sdk/README.md
```

**Pass criteria:** Count is 3 or more (all three strings appear).

---

## Scenario Group 5 — Regression Guard

### S11 — All existing Vitest tests still pass after package.json changes

**Given** F004 `package.json` changes are applied
**When** `npm test` is executed
**Then** 225 tests pass, 0 fail
**And** exit code is 0

**Verification command:**
```bash
npm test
```

**Pass criteria:** Vitest summary shows 0 failures; exit code 0.

---

### S12 — tsconfig.build.json still excludes tests/ after any config edits

**Given** `tsconfig.build.json` modified in T01 (or confirmed unchanged)
**When** `tsc -p tsconfig.build.json` is executed
**Then** no `*.test.ts` files are compiled
**And** `dist/` contains only files mirroring `src/` structure

**Verification command:**
```bash
npm run build && find dist/ -name "*.test*"
```

**Pass criteria:** `find` output is empty.
