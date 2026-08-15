---
doc_type: adr
domain: state
stack: [TypeScript, Node.js]
node_id: "adr:state_persistence"
tags: [state, persistence, atomic, file-state]
edges:
  - relation: references
    target: "adr:architecture"
updated: "2026-08-15"
---
# State Persistence
Governs localized file state mutations and data structures for features and tasks.

## OVERVIEW
The orchestrator persists its state using local markdown and JSON files. All updates run through the `FileStateManager` adapter to guarantee transactional integrity and prevent data corruption.

## FOLDER STRUCTURE
<folder_structure>
sdk/
├── src/
│   └── file-state/               # File state ports and parsers
│       ├── FileStateManager.ts   # Writes and reads state files atomically
│       ├── types.ts              # Defines backlog, task, and rules types
│       └── parsers/              # Backlog, bootstrap config, and dev state parsers
│           ├── BacklogParser.ts          # Strips markdown wrapping from IDs
│           ├── BootstrapConfigParser.ts  # Parses BOOTSTRAP-CONFIG.json
│           └── DevStateParser.ts         # Parses DEVELOPMENT-STATE.md tables
└── docs/
    └── product/
        ├── BACKLOG.md            # Features backlog index markdown file
        ├── DEVELOPMENT-STATE.md  # Tasks execution state markdown file
        └── BOOTSTRAP-CONFIG.json # Global runtime rules and thresholds
</folder_structure>

## HOW TO UPDATE PRODUCT STATE
### Prerequisites
1. Product directory initialized with `BACKLOG.md` and `DEVELOPMENT-STATE.md`.
2. Valid `fsm` instance injected into the phase context.

### Steps
1. Load current feature structures using `fsm.loadBacklog()`.
2. Apply mutations on memory structures.
3. Write back to disk atomically using `fsm.updateFeatureStatus` or `fsm.updateTaskStatus`.

<code_example>
# CORRECT: Perform atomic writes by writing to tmp and renaming
const tmpPath = `${filePath}.tmp`
writeFileSync(tmpPath, content, 'utf-8')
renameSync(tmpPath, filePath) // Prevents corruption during crashes

# WRONG: Direct write to target files that could get corrupted on process exit
writeFileSync(filePath, content, 'utf-8')
</code_example>

## PARAMETERS / CONFIGURATIONS
| Name | Type | Required | Description | Default |
|------|------|----------|-------------|---------|
| BACKLOG.md | Markdown | Yes | Contains features backlog, priorities, status, and scores | — |
| DEVELOPMENT-STATE.md | Markdown | Yes | Contains development tasks list, phase status, and progress | — |
| BOOTSTRAP-CONFIG.json | JSON | Yes | Stores validation thresholds, rule overrides, and cycles | — |

## BEST PRACTICES
REQUIRED: Write files using temporary naming structures before executing renames to prevent partial files.
REQUIRED: Parse and sanitize all markdown structures defensively to handle formatting variations.
FORBIDDEN: Mutating development files directly without calling the file state manager adapter.

## REFERENCES
- [**ARCHITECTURE.md**](./ARCHITECTURE.md): Ports-and-Adapters structure and dependencies.
- [**TESTS.md**](./TESTS.md): Vitest runner mock execution protocols.
