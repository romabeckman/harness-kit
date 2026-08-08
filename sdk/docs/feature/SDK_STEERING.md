---
doc_type: feature
domain: steering
stack: [TypeScript, Node.js]
node_id: "feature:sdk_steering"
tags: [steering, rules, directives, LLM]
edges:
  - relation: implements
    target: "adr:architecture"
  - relation: tested_by
    target: "adr:tests"
updated: "2026-08-08"
---
# SDK STEERING
Allows developers to inject runtime directives when resuming an orchestration session.

## OVERVIEW
The steering module translates a free-text steering message into structured `SteeringAction` values using an LLM. It modifies `BOOTSTRAP-CONFIG.json` to persist rules or roll back the orchestrator's phase state.

## FOLDER STRUCTURE
<folder_structure>
```
sdk/src/orchestrator/
└── SteeringAnalyzer.ts   # LLM-based steering message classifier

docs/product/
└── BOOTSTRAP-CONFIG.json # Persists steeringRules[]
```
</folder_structure>

## HOW TO APPLY STEERING

### Prerequisites
1. Provide an LLM agent runner instance.
2. Orchestrator must be initialized.

### Steps
1. Run `hrns run --resume`.
2. Provide a steering instruction.

<code_example>
# CORRECT: Context assembler automatically injects rules
const payload = ContextAssembler.buildPlanningPayload(feature, paths, steeringRules);

# WRONG: Omitting rules means agents never see developer constraints
const payload = ContextAssembler.buildPlanningPayload(feature, paths);
</code_example>

## BEST PRACTICES
REQUIRED: Keep steering rules concise and imperative.
REQUIRED: After applying a rollback action, let the orchestrator reset all in-progress tasks automatically.
REQUIRED: Use steering rules to configure phase-specific behavior constraints.
PROHIBITED: Adding duplicate rules. The system does not deduplicate automatically.
PROHIBITED: Calling `applySteeringActions` with an empty array.

## REFERENCES
- [**SDK_CORE.md**](./SDK_CORE.md): `BootstrapConfig` type and `applySteeringActions` method.
- [**SDK_AGENT_RUNNER.md**](./SDK_AGENT_RUNNER.md): `IAgentRunner` interface used by `SteeringAnalyzer`.
- [**ARCHITECTURE.md**](../adr/ARCHITECTURE.md): `SteeringAnalyzer` module responsibilities.

---

## CHANGE SUMMARY
- **Added:** YAML frontmatter, CHANGE SUMMARY, code examples.
- **Updated:** UPPERCASE section titles.
- **Removed:** Redundant flow diagrams.
