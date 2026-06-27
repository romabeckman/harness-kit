# Tactical Design — SDK Package (F004)

Domain: `sdk_package`
Project: `sdk`
Sources: `001-sdk-package-problem-space.md`, `002-sdk-package-context-map.md`

---

## Section 1 — Existing State Audit

Before modifying any file, the following current state is confirmed:

| File | Current State | F004 Action |
|---|---|---|
| `sdk/package.json` | `version: "0.1.0"`, `main: "dist/index.js"`, `types: "dist/index.d.ts"`, build/test/typecheck scripts present, no `exports` field, no `files` field, no `prepublishOnly` script | Update |
| `sdk/tsconfig.build.json` | Exists: extends `tsconfig.json`, `rootDir: "src"`, `outDir: "dist"`, `include: ["src/**/*"]`, `exclude: ["node_modules", "dist", "tests"]` — declarations/source maps inherited from `tsconfig.json` | Verify only — no overwrite unless values are wrong |
| `sdk/tsconfig.json` | `declaration: true`, `declarationMap: true`, `sourceMap: true` already set | No change |
| `sdk/dist/` | Produced by `tsc -p tsconfig.build.json` — already exists from prior builds | Re-verify after any config change |
| `sdk/README.md` | Does not exist | Create |

---

## Section 2 — package.json Target State

The complete target `package.json` after F004:

```json
{
  "name": "harness-kit-sdk",
  "version": "1.0.0",
  "description": "SDK for autonomous TDD orchestration — drive agents through a fixed state machine loop",
  "license": "MIT",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build && npm test"
  },
  "devDependencies": {
    "@types/node": "^26.0.1",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.106.0"
  }
}
```

**Change rationale per field:**

| Field | Change | Rationale |
|---|---|---|
| `version` | `0.1.0` → `1.0.0` | F001–F003 complete; public API is stable and tested. Semver `1.0.0` signals production readiness. |
| `description` | Expanded | npm registry visitors see the description before visiting README. |
| `license` | Added `"MIT"` | Required for public npm packages; was missing. |
| `exports` | Added | Node ≥ 12 resolution. CJS-only; no ESM output. Restricts subpath imports — only `.` is public. |
| `files` | Added `["dist", "README.md"]` | Whitelist: publishes compiled output and README only. Excludes `src/`, `tests/`, `docs/`, tsconfig files, `node_modules`. |
| `prepublishOnly` | Added | Enforces build-then-test atomicity before `npm publish`. |

---

## Section 3 — tsconfig.build.json Verification

`tsconfig.build.json` must satisfy:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

The base `tsconfig.json` already sets `declaration: true`, `declarationMap: true`, `sourceMap: true`. Because `tsconfig.build.json` extends `tsconfig.json`, those settings are inherited without repetition.

**The existing file already satisfies all requirements. T01 must verify it and NOT overwrite it if correct.** This is a read-and-confirm task, not a write task.

---

## Section 4 — README.md Target Content

`sdk/README.md` must cover:

1. Package name and one-sentence description
2. Installation: `npm install harness-kit-sdk`
3. `HarnessOrchestrator` usage example — construct with `OrchestratorConfig` and call `run()`
4. Required environment variable: `ANTHROPIC_API_KEY` (for `ClaudeAgentRunner`)
5. Note on injecting a custom `IAgentRunner` for testing

Minimum viable — not exhaustive. A developer who reads it must know how to instantiate and run the orchestrator.

---

## Section 5 — npm pack Verification Contract

After F004 changes are applied, `npm pack --dry-run` (run from `sdk/`) must satisfy:

| Check | Expected |
|---|---|
| `dist/index.js` present | Yes |
| `dist/index.d.ts` present | Yes |
| `dist/index.js.map` present | Yes |
| `dist/index.d.ts.map` present | Yes |
| `README.md` present | Yes |
| `src/` present | No |
| `tests/` present | No |
| `tsconfig*.json` present | No |
| `docs/` present | No |
| `node_modules/` present | No |

If any check fails, the `files` field must be corrected before the task is marked complete.

---

## Section 6 — Implementation Tasks (Ordered)

| Task ID | Description |
| --- | --- |
| T01 | Read `sdk/tsconfig.build.json` and verify it sets `rootDir: "src"`, `outDir: "dist"`, excludes `tests/`, and inherits `declaration`, `declarationMap`, `sourceMap` from `tsconfig.json`. If all values are correct, make no changes. If any value is missing or wrong, update the file to match Section 3 above. |
| T02 | Update `sdk/package.json`: set `version` to `"1.0.0"`, add `license: "MIT"`, expand `description`, add `exports` map (`.` → CJS only), add `files: ["dist", "README.md"]`, add `prepublishOnly: "npm run build && npm test"` script. Preserve all existing fields verbatim unless listed above. |
| T03 | Run `npm run build` from `sdk/` directory and confirm exit code 0. Confirm `dist/index.js`, `dist/index.d.ts`, `dist/index.js.map`, `dist/index.d.ts.map` all exist after the build. |
| T04 | Run `npm run typecheck` from `sdk/` directory and confirm zero TypeScript errors. This validates that the public API types in `src/index.ts` round-trip correctly. |
| T05 | Run `npm pack --dry-run` from `sdk/` directory and verify the file list matches the contract in Section 5: `dist/` and `README.md` included; `src/`, `tests/`, `tsconfig*.json`, `docs/`, `node_modules/` excluded. If the list diverges, adjust `files` in `package.json` and re-run. |
| T06 | Run `npm test` from `sdk/` directory and confirm all Vitest tests pass with exit code 0 (225 tests must pass, 0 failures). |
| T07 | Write `sdk/README.md` with: package name + one-sentence description, `npm install harness-kit-sdk` install command, `HarnessOrchestrator` usage example with `OrchestratorConfig` construction and `run()` call, `ANTHROPIC_API_KEY` environment variable note, brief note on injecting a custom `IAgentRunner` for testing without network access. |
| T08 | Simulate `prepublishOnly` by running `npm run build && npm test` sequentially from `sdk/`. Both must exit code 0. Confirm the hook order: build first, test second. |
