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
updated: "2026-08-08"
---
# SDK PACKAGE
Defines the publication surface of `harness-kit-sdk` for npm.

## OVERVIEW
The `sdk_package` configures `package.json` and `tsconfig.build.json` so that `npm publish` emits a clean, type-safe CJS-only package. The exports map exposes a single entry and restricts the tarball to compiled files.

## FOLDER STRUCTURE
<folder_structure>
```
sdk/
├── package.json          # npm config with prepublishOnly gate
├── tsconfig.build.json   # Scoped to src/**/*, excludes tests
├── README.md             # Package documentation
└── src/
    └── cli/
        └── run.ts        # CLI entry point
```
</folder_structure>

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

<code_example>
# CORRECT: single "." entry — forces callers through the public index
"exports": {
  ".": {
    "require": "./dist/index.js",
    "types": "./dist/index.d.ts"
  }
}

# WRONG: no exports field — allows deep imports to private modules
"main": "dist/index.js"
</code_example>

## PARAMETERS / CONFIGURATIONS

| Name | Type | Required | Description | Default |
|------|------|----------|-------------|---------|
| `name` | string | Yes | Scoped package name for npm registry | `@romabeckman/hrns` |
| `exports["."].require` | string | Yes | CJS entry via `exports` map | `./dist/index.js` |
| `files` | string[] | Yes | Tarball whitelist | `["dist", "README.md"]` |

## BEST PRACTICES
REQUIRED: Keep `exports` map as the authoritative entry point.
REQUIRED: Add new public exports only through `sdk/src/index.ts`.
PROHIBITED: Committing the `dist/` directory to source control.

## REFERENCES
- [**SDK_CORE.md**](./SDK_CORE.md): Public API surface compiled into `dist/`.
- [**SDK_STATE.md**](./SDK_STATE.md): High-level state mutation methods included in the published package.
- [**SDK_AGENT_RUNNER.md**](./SDK_AGENT_RUNNER.md): Agent Runner error types included in the published package.
- [**ARCHITECTURE.md**](../adr/ARCHITECTURE.md): CJS-only exports boundary decision.

---

## CHANGE SUMMARY
- **Added:** Frontmatter fields, code examples, change summary.
- **Updated:** Section titles uppercase, reformatted concepts.
- **Removed:** Extraneous implementation details that belong in code.
