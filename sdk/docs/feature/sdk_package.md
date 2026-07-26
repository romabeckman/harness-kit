# sdk_package — npm Publication Configuration

The `sdk_package` module defines the publication surface of `harness-kit-sdk`: its exports map, file whitelist, build exclusions, and publication guard.

---

## OVERVIEW

F004 configures `sdk/package.json` and `sdk/tsconfig.build.json` so that `npm publish` emits a clean, type-safe CJS-only package. The `exports` map exposes a single `"."` entry; the `files` whitelist restricts the tarball to `dist/` and `README.md`; `prepublishOnly` enforces a full build-and-test gate before any publish. No new source files or ports are introduced.

---

## FOLDER STRUCTURE

<folder_structure>
sdk/
├── package.json          # name, version, exports map, bin, files whitelist, prepublishOnly
├── tsconfig.build.json   # Scoped to src/**/*; excludes tests and __tests__ dirs
├── README.md             # Package-level documentation included in the npm tarball
├── src/
│   └── cli/
│       └── run.ts        # CLI entry point — interactive orchestrator launcher
└── dist/                 # Build output (tsc -p tsconfig.build.json) — not committed
    └── cli/
        └── run.js        # Compiled CLI entry point — shebang injected by postbuild
</folder_structure>

---

## PACKAGE CONFIGURATION

### Exports Map

```json
// CORRECT: single "." entry — forces callers through the public index
"exports": {
  ".": {
    "require": "./dist/index.js",
    "types": "./dist/index.d.ts"
  }
}

// WRONG: no exports field — allows deep imports to private modules
"main": "dist/index.js"
```

### bin Field

```json
"bin": {
  "hrns": "dist/cli/run.js",
  "harness-kit": "dist/cli/run.js"
}
```

Exposes two CLI entry points: `hrns` (short alias) and `harness-kit` (full alias). Enables `npx @romabeckman/hrns run` without a wrapper script. The compiled `dist/cli/run.js` requires a Unix shebang (`#!/usr/bin/env node`) which is injected by the postbuild script — `tsc` does not emit shebangs from source comments.

**CJS-only decision** — No `"import"` condition is defined. The package ships CommonJS only. ESM dual-publishing is deferred; adding an `"import"` entry later is additive and non-breaking.

### Files Whitelist

```json
// CORRECT: explicit allowlist keeps test fixtures and source maps out of the tarball
"files": ["dist", "README.md"]

// WRONG: omitting "files" — publishes everything not in .npmignore, including src/ and tests/
```

### Runtime Dependencies

`@inquirer/prompts` is a required runtime dependency. It drives the interactive CLI prompts in `src/cli/run.ts` (select, input). It must be listed under `dependencies` (not `devDependencies`) because it is bundled into the published package and executed at runtime via `npx harness-kit-sdk run`.

### Publication Guard

```json
// CORRECT: full build + test before publish
"prepublishOnly": "npm run build && npm test"
```

`prepublishOnly` runs automatically before `npm publish`. It prevents publishing a stale or broken `dist/`.

---

## BUILD CONFIGURATION

### tsconfig.build.json Exclusions

```json
// CORRECT: exclude tests so .d.ts and .js files for test helpers never enter dist/
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests", "src/**/__tests__"]
}
```

`tests/` (top-level Vitest suites) and `src/**/__tests__` (co-located unit tests) are both excluded. The `rootDir: "src"` constraint means only files under `src/` can appear in `dist/`.

---

## PARAMETERS / CONFIGURATIONS

| Field | Location | Required | Value | Notes |
|---|---|---|---|---|
| `name` | `package.json` | Yes | `@romabeckman/hrns` | Scoped package name for npm registry |
| `version` | `package.json` | Yes | `0.1.6` | Semantic version — current beta release |
| `main` | `package.json` | Yes | `dist/index.js` | CJS entry point (legacy `require` fallback) |
| `types` | `package.json` | Yes | `dist/index.d.ts` | TypeScript declaration entry |
| `exports["."].require` | `package.json` | Yes | `./dist/index.js` | CJS entry via `exports` map |
| `exports["."].types` | `package.json` | Yes | `./dist/index.d.ts` | Type declarations via `exports` map |
| `files` | `package.json` | Yes | `["dist", "README.md"]` | Tarball whitelist — all other files excluded |
| `bin["hrns"]` | `package.json` | Yes | `dist/cli/run.js` | Short CLI alias — enables `hrns run` |
| `bin["harness-kit"]` | `package.json` | Yes | `dist/cli/run.js` | Full CLI alias — enables `harness-kit run` |
| `prepublishOnly` | `package.json` | Yes | `npm run build && npm test` | Full gate before `npm publish` |
| `outDir` | `tsconfig.build.json` | Yes | `dist` | Compile output directory |
| `rootDir` | `tsconfig.build.json` | Yes | `src` | Restricts compiled sources to `src/` only |
| `exclude` | `tsconfig.build.json` | Yes | `["node_modules","dist","tests","src/**/__tests__"]` | Prevents test files from entering `dist/` |

---

## BEST PRACTICES

REQUIRED: Run `npm run build` before inspecting `dist/` — the directory is not committed and must be built locally. The `postbuild` script injects the `#!/usr/bin/env node` shebang into `dist/cli/run.js` after `tsc` completes; do not modify the compiled file directly.

REQUIRED: Keep `exports` map as the authoritative entry point. The `"main"` field is a legacy fallback for tooling that does not support `exports`; it must stay consistent with `exports["."].require`.

REQUIRED: Add new public exports only through `sdk/src/index.ts` — the `exports` map points to the compiled `index.js`, so any symbol not re-exported from `index.ts` is not part of the public API.

FORBIDDEN: Do not add an `"import"` condition to the exports map without also configuring `"type": "module"` or a dual-build pipeline — mixing CJS output with an ESM condition breaks consumers.

FORBIDDEN: Do not commit the `dist/` directory — it is a build artefact regenerated by `npm run build` and verified by `prepublishOnly` on every publish.

---

## REFERENCES

- [**sdk_core.md**](./sdk_core.md): Public API surface (`src/index.ts`) that `tsconfig.build.json` compiles into `dist/`
- [**sdk_state.md**](./sdk_state.md): High-level state mutation methods included in the published package
- [**sdk_agent_runner.md**](./sdk_agent_runner.md): `ClaudeAgentRunner` and error types included in the published package
- [**ARCHITECTURE.md**](../adr/ARCHITECTURE.md): CJS-only exports boundary decision and `files` whitelist as publication surface boundary
