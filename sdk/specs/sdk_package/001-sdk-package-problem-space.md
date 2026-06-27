# Problem Space — SDK Package (F004)

Domain: `sdk_package`
Feature: npm package setup — build, types, publish config

---

## 1. Big Picture Event Storming

The following events represent the observable lifecycle of preparing and publishing `harness-kit-sdk` to npm.

| # | Domain Event | Trigger / Actor | Resulting State Change |
|---|---|---|---|
| 1 | `BuildConfigured` | Developer sets `tsconfig.build.json` emit targets | `rootDir=src`, `outDir=dist`, declarations and source maps enabled; tests excluded |
| 2 | `PackageManifestUpdated` | Developer sets `package.json` fields | `name`, `version`, `main`, `types`, `exports`, `files` set; `prepublishOnly` wired |
| 3 | `BuildExecuted` | Developer runs `npm run build` | `tsc -p tsconfig.build.json` produces `dist/` with `.js`, `.d.ts`, `.d.ts.map`, `.js.map` files |
| 4 | `TypesVerified` | Developer runs `tsc --noEmit` | Zero TypeScript errors; public API types round-trip correctly through `dist/index.d.ts` |
| 5 | `FilesFieldValidated` | Developer runs `npm pack --dry-run` | Pack manifest lists only intended files; `src/`, `tests/`, spec docs excluded |
| 6 | `PrepublishHookVerified` | Developer triggers `prepublishOnly` | Build runs, then all Vitest tests pass; fails fast if either step fails |
| 7 | `PackagePublished` | Developer runs `npm publish` | `dist/` contents uploaded to npm registry under `harness-kit-sdk` |
| 8 | `SDKImportVerified` | Consumer installs `harness-kit-sdk` and imports | `HarnessOrchestrator`, `FileStateManager`, `ClaudeAgentRunner` importable without type errors |
| 9 | `READMEPresent` | Developer creates `sdk/README.md` | Usage example with `HarnessOrchestrator` instantiation visible to npm registry visitors |

---

## 2. Subdomain Classification

| Subdomain | Type | Rationale |
|---|---|---|
| **Package Manifest** (`package.json` fields, exports map, files field) | Supporting | Mechanical configuration — industry-standard patterns, no domain logic. |
| **Build Pipeline** (`tsconfig.build.json`, `tsc` invocation, `dist/` output) | Supporting | TypeScript compilation with exact include/exclude boundaries. Correctness matters; the logic is prescribed by `tsc`. |
| **Publish Gate** (`prepublishOnly` script, `npm pack --dry-run` verification) | Supporting | Prevents shipping broken or oversized packages. Rule-based, not creative. |
| **Consumer Documentation** (`README.md` in `sdk/`) | Generic | Describes usage. No domain logic. Must exist and be accurate. |

---

## 3. Ubiquitous Language Glossary

| Term | Definition |
|---|---|
| **dist/** | The compiled output directory. Contains `.js`, `.d.ts`, `.d.ts.map`, `.js.map` files mirroring `src/` structure. Never committed. |
| **main** | `package.json` field pointing to `dist/index.js` — the CJS entry point for Node consumers. |
| **types** | `package.json` field pointing to `dist/index.d.ts` — the TypeScript declaration entry point. |
| **exports** | `package.json` `exports` map. Governs what can be imported from `harness-kit-sdk`. Points `.` at `dist/index.js` and `dist/index.d.ts`. |
| **files** | `package.json` `files` array. The whitelist of paths included in the published tarball. Anything not listed is excluded. |
| **prepublishOnly** | npm lifecycle hook. Runs automatically before `npm publish`. Must run build and tests. |
| **tsconfig.build.json** | Production TypeScript config. Extends `tsconfig.json`, sets `rootDir=src`, `outDir=dist`, excludes `tests/`. Enables `declaration`, `declarationMap`, `sourceMap`. |
| **declaration** | `tsc` flag. Emits `.d.ts` files alongside `.js` files. Required for TypeScript consumers. |
| **declarationMap** | `tsc` flag. Emits `.d.ts.map` files enabling "Go to source" navigation to `.ts` originals. |
| **npm pack --dry-run** | Simulates packing without creating a tarball. Prints the file list that would be included. Used to verify `files` field correctness. |

---

## 4. Socratic Questions

1. **Exports map scope:** The `exports` field in `package.json` restricts subpath imports. If a consumer tries `import { BacklogParser } from 'harness-kit-sdk/file-state/parsers/BacklogParser'`, should that succeed or be blocked? Is `BacklogParser` part of the public API, or is it implementation detail?

2. **CommonJS vs ESM:** `tsconfig.json` targets `"module": "CommonJS"`. Should `package.json` have a `type` field? If omitted, Node treats `.js` files as CJS. If a future consumer needs ESM, how would dual-output be structured — or is CJS-only intentional for this SDK's use case?

3. **Version strategy:** F004 sets version `1.0.0`. Given that F001–F003 are `COMPLETED` and `package.json` currently reads `0.1.0`, what version policy signals to consumers that this is a production-ready stable release?

4. **Peer dependency vs dependency:** `@anthropic-ai/sdk` is a runtime dependency. Should it be a `dependency` (bundled with install) or `peerDependency` (consumer provides it)? Callers who use `ClaudeAgentRunner` need it; callers who inject their own `IAgentRunner` implementation do not.

5. **README coverage depth:** The README must include a usage example for `HarnessOrchestrator`. Should it also document `FileStateManager` and `ClaudeAgentRunner` setup, or is one class sufficient for an npm listing? How does this affect the `description` field in `package.json`?

6. **Source maps and security:** Publishing `sourceMap: true` embeds references to `.ts` source files. Does publishing source maps expose internal implementation that should remain private? Or is full source available on GitHub anyway, making this a non-issue?

7. **dist/ in .gitignore vs npm files:** `dist/` is excluded from git (standard practice). The `files` field in `package.json` includes `dist/`. If the `prepublishOnly` hook fails to run before a manual `npm publish`, `dist/` may be stale. Is there a safeguard beyond `prepublishOnly` itself?
