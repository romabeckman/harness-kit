---
doc_type: feature
domain: package
stack: [TypeScript, Node.js]
node_id: "feature:sdk_package"
tags: [package, npm, build, exports]
edges:
  - relation: implements
    target: "adr:architecture"
  - relation: tested_by
    target: "adr:tests"
updated: 2026-11-06
---

```graph
{"node_id":"feature:sdk_package","domain":"package","implements":["adr:architecture"],"tested_by":["adr:tests"],"entrypoints":["src/index.ts","src/cli/run.ts"],"registration_files":["package.json"],"reference_files":[],"code_files":["tsconfig.json","tsconfig.build.json"],"test_files":["tests/unit/t01-scaffold.test.ts","tests/unit/t15-public-api.test.ts"],"knowledge":{"schema_version":1,"entities":[{"id":"contract:npm-package-surface","type":"contract","label":"SDK package surface","definition":"Package metadata that selects the published version, public entry, and included files.","aliases":[]},{"id":"capability:package-distribution","type":"capability","label":"SDK package distribution","definition":"Build and expose the npm package's public API and command-line entries.","aliases":[]},{"id":"rule:prepublish-hook","type":"rule","label":"Prepublish hook","definition":"The package manifest's configured build and test sequence for the prepublishOnly lifecycle script.","aliases":[]},{"id":"contract:package-build","type":"contract","label":"Package build inputs and output","definition":"The TypeScript build configuration and package script that produce the distribution files.","aliases":[]}],"claims":[{"id":"claim:package-version-and-exports","subject":"contract:npm-package-surface","relation":null,"object":null,"statement":"package.json sets version 0.9.5, exposes dist/index.js and dist/index.d.ts from the root export, and allows dist plus README.md in the package.","kind":"observation","status":"supported","evidence":[{"kind":"configuration","source":"package.json","locator":"version, exports['.'], and files","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:package-public-entries","subject":"capability:package-distribution","relation":"exposes","object":"contract:npm-package-surface","statement":"The root export selects dist/index.js for require and dist/index.d.ts for types; hrns and harness-kit both select dist/cli/run.js.","kind":"observation","status":"supported","evidence":[{"kind":"configuration","source":"package.json","locator":"exports['.'] and bin","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:prepublish-script","subject":"capability:package-distribution","relation":"constrained_by","object":"rule:prepublish-hook","statement":"The prepublishOnly script is configured as npm run build && npm test.","kind":"observation","status":"supported","evidence":[{"kind":"configuration","source":"package.json","locator":"scripts.prepublishOnly","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:build-distribution","subject":"capability:package-distribution","relation":"depends_on","object":"contract:package-build","statement":"The build script runs tsc with tsconfig.build.json, then ensures the CLI shebang; that config sets rootDir to src, outDir to dist, includes src/**/*, and excludes tests.","kind":"observation","status":"supported","evidence":[{"kind":"configuration","source":"package.json","locator":"scripts.build","snapshot":null},{"kind":"configuration","source":"tsconfig.build.json","locator":"compilerOptions.rootDir, compilerOptions.outDir, include, exclude","snapshot":null}],"derived_from":[],"gap":null}]}}
```

# SDK PACKAGE
Defines the publication surface of `@romabeckman/hrns` for npm.

## OVERVIEW
The package manifest sets `@romabeckman/hrns` to version `0.9.5`. Its exports map exposes the compiled CommonJS entry and declarations; the publish allowlist contains `dist` and `README.md`.

## FOLDER STRUCTURE

```text
sdk/
└── src/          # Public API and CLI entry point
    └── cli/      # CLI entry point
```

The npm config with prepublishOnly gate is `package.json`. `tsconfig.build.json` is scoped to `src/**/*`, excludes tests. `README.md` provides package documentation.

## MAIN CONCEPTS

### Package configuration
- **Exports Map**: Exposes a single `.` entry, forcing callers through the public index.
- **Files Whitelist**: Explicitly lists `dist` and `README.md` to prevent publishing test artifacts.

## HOW TO CONFIGURE PACKAGE EXPORTS

### Prerequisites
1. Ensure the build pipeline works correctly.
2. Ensure you have `package.json` properly configured.

### Steps
1. Add explicit `exports` map.
2. Define the `files` array.

**CORRECT:** single "." entry — forces callers through the public index.

```json
{"exports":{".":{"require":"./dist/index.js","types":"./dist/index.d.ts"}}}
```

**WRONG:** no exports field — allows deep imports to private modules.

```json
{"main":"dist/index.js"}
```

## PARAMETERS / CONFIGURATIONS

| Name | Type | Required | Description | Default |
|------|------|----------|-------------|---------|
| `name` | string | Yes | Scoped package name for npm registry | `@romabeckman/hrns` |
| `version` | string | Yes | Manifest package version | `0.9.5` |
| `exports["."].require` | string | Yes | CJS entry via `exports` map | `./dist/index.js` |
| `files` | string[] | Yes | Tarball whitelist | `["dist", "README.md"]` |

## BEST PRACTICES
REQUIRED: Keep `exports` map as the authoritative entry point.
REQUIRED: Add new public exports only through `src/index.ts`.
PROHIBITED: Committing the `dist/` directory to source control.

## REFERENCES
- [**SDK_CORE.md**](../orchestration/SDK_CORE.md): Public API surface compiled into `dist/`.
- [**SDK_STATE.md**](../orchestration/SDK_STATE.md): High-level state mutation methods included in the published package.
- [**SDK_AGENT_RUNNER.md**](../agents/SDK_AGENT_RUNNER.md): Agent Runner error types included in the published package.
- [**ARCHITECTURE.md**](../../adr/ARCHITECTURE.md): CJS-only exports boundary decision.
- [**TESTS.md**](../../adr/TESTS.md): Testing strategy and commands.
