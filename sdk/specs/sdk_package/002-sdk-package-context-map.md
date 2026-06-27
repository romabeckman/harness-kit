# Context Map — SDK Package (F004)

Domain: `sdk_package`
Source of truth: `001-sdk-package-problem-space.md`

---

## 1. Bounded Contexts

### BC-1: PackageManifest

**Responsibility:** Own the `sdk/package.json` configuration. Define all fields that control npm resolution, consumer imports, and publish behavior. Ensure the manifest is consistent and complete before publishing.

**What it knows:**
- `name`, `version`, `description`, `license`
- `main` — CJS entry point: `dist/index.js`
- `types` — TypeScript declarations: `dist/index.d.ts`
- `exports` — subpath map restricting what is importable from the package
- `files` — whitelist of published paths
- `scripts`: `build`, `test`, `typecheck`, `prepublishOnly`
- `dependencies`, `devDependencies`

**What it does NOT know:**
- The content of `dist/` (that is `BuildPipeline`'s output)
- The compilation settings (`tsconfig.build.json`) — those belong to `BuildPipeline`
- Test specifics — those belong to `PublishGate` / Vitest config

**Aggregate root:** `package.json`

---

### BC-2: BuildPipeline

**Responsibility:** Produce a correct, complete `dist/` output from `sdk/src/`. Ensure `tsconfig.build.json` is the exclusive build config (not `tsconfig.json`). Guarantee that declarations, declaration maps, and source maps are emitted. Guarantee that `tests/` is excluded from the compiled output.

**What it knows:**
- `tsconfig.build.json` settings: `rootDir=src`, `outDir=dist`, `declaration=true`, `declarationMap=true`, `sourceMap=true`, `exclude=["tests"]`
- The `build` script: `tsc -p tsconfig.build.json`
- That `tsconfig.build.json` extends `tsconfig.json` (inherits strict settings)

**What it does NOT know:**
- npm publish mechanics (PackageManifest's concern)
- Test execution (PublishGate's concern)
- What files npm will include (PackageManifest's `files` field)

**Key output:** `dist/` directory containing compiled artifacts

---

### BC-3: PublishGate

**Responsibility:** Enforce the quality and completeness contract before `npm publish`. Run build and tests atomically via `prepublishOnly`. Verify pack output with `npm pack --dry-run`. Provide the operator with evidence that the published tarball is correct.

**What it knows:**
- `prepublishOnly` script: `npm run build && npm test`
- `npm pack --dry-run` output: expected files, excluded paths
- That a stale or missing `dist/` must cause `npm publish` to fail visibly

**What it does NOT know:**
- How `dist/` is produced (BuildPipeline)
- What fields configure the tarball (PackageManifest's `files` field)

---

### BC-4: ConsumerDocumentation

**Responsibility:** Provide an `sdk/README.md` that is accurate, minimal, and visible on the npm registry. Must include a working `HarnessOrchestrator` instantiation example. Must reference required environment variables (`ANTHROPIC_API_KEY` for `ClaudeAgentRunner`).

**What it knows:**
- Public API entry points: `HarnessOrchestrator`, `FileStateManager`, `ClaudeAgentRunner`
- Required setup: `ANTHROPIC_API_KEY` environment variable
- Install command: `npm install harness-kit-sdk`

**What it does NOT know:**
- Internal implementation details
- How tests are organized

---

## 2. Context Map Relationships

```
                      ┌──────────────────────────┐
                      │     PackageManifest       │  ← BC-1
                      │     package.json           │
                      │  (fields, scripts, files)  │
                      └───────┬──────────┬─────────┘
                              │          │
               ┌──────────────┘          └──────────────┐
               ▼                                        ▼
  ┌──────────────────────┐                ┌─────────────────────────┐
  │   BuildPipeline      │                │      PublishGate         │
  │   BC-2               │                │      BC-3                │
  │   tsconfig.build.json│                │  prepublishOnly          │
  │   dist/ output       │                │  npm pack --dry-run      │
  └──────────────────────┘                └─────────────────────────┘
                                                    │
                                         ┌──────────▼──────────┐
                                         │ ConsumerDocumentation│  ← BC-4
                                         │ sdk/README.md        │
                                         └──────────────────────┘
```

---

## 3. Integration Patterns

| Relationship | Pattern | Rationale |
|---|---|---|
| PackageManifest → BuildPipeline | **Published Language** | `package.json` `main` and `types` fields name outputs that `BuildPipeline` must produce at exactly those paths. If paths diverge, consumers break. |
| PackageManifest → PublishGate | **Customer / Supplier** | `PackageManifest` defines the `files` whitelist and `prepublishOnly` script; `PublishGate` executes and validates them. |
| BuildPipeline → PublishGate | **Upstream / Downstream** | `PublishGate` (`prepublishOnly`) depends on `BuildPipeline` output being present and correct. `BuildPipeline` runs first. |
| ConsumerDocumentation → PackageManifest | **Conformist** | README must reflect the actual `name`, `version`, and install command from `package.json`. No creative deviation permitted. |

---

## 4. Boundary Rules

- **`dist/` is BuildPipeline's exclusive output.** No file under `dist/` is hand-authored. It is re-generated on every build.
- **`package.json` is the single source of truth for publish configuration.** No `.npmignore` is used — the `files` whitelist in `package.json` is the only mechanism governing tarball content.
- **`tsconfig.build.json` must not include `tests/`.** Including tests in the build output would ship test files to consumers and may emit declaration files referencing Vitest types.
- **`prepublishOnly` must fail fast.** If `npm run build` exits non-zero, `npm test` must not run. If `npm test` exits non-zero, `npm publish` must not proceed.
- **No subpath exports** expose internal parser or adapter modules. The exported surface is exactly `sdk/src/index.ts`.
