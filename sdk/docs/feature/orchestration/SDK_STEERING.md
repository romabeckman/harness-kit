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
updated: "2026-09-26"
---

```graph
{"node_id":"feature:sdk_steering","domain":"steering","implements":["adr:architecture"],"tested_by":["adr:tests"],"entrypoints":["src/orchestrator/SteeringAnalyzer.ts"],"registration_files":[],"reference_files":["src/orchestrator/services/SteeringService.ts"],"code_files":["src/file-state/types.ts"],"test_files":["src/orchestrator/__tests__/SteeringAnalyzer.test.ts","src/orchestrator/services/__tests__/SteeringService.test.ts","tests/integration/FileStateSteering.test.ts","tests/unit/t02-types.test.ts","tests/unit/t18-steering-constraints.test.ts","tests/unit/t31-steering-analyzer-and-directives.test.ts"]}
```

# SDK STEERING
Allows developers to inject runtime directives when resuming an orchestration session.

## OVERVIEW
The steering module translates a free-text steering message into structured `SteeringAction` values using an LLM. It modifies `BOOTSTRAP-CONFIG.json` to persist rules or roll back the orchestrator's phase state. Default user rules suppress progress narration and require an empty JSON completion response.

## KNOWLEDGE

```json
{"schema_version":1,"entities":[{"id":"capability:session-steering","type":"capability","label":"Session steering","definition":"Convert developer steering messages into validated actions that update runtime rules, phase state, or review scores.","aliases":[]},{"id":"rule:steering-action-validation","type":"rule","label":"Steering action validation","definition":"Accept only recognized actions with valid phase names and bounded rule lengths; clamp numeric scores to the supported range.","aliases":[]}],"claims":[{"id":"claim:steering-actions-validated","subject":"capability:session-steering","relation":"constrained_by","object":"rule:steering-action-validation","statement":"SteeringAnalyzer accepts add_rule strings up to 5000 characters, rollback targets from its valid phase list, and clamps numeric scores to 0 through 10; other malformed actions are ignored.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/orchestrator/SteeringAnalyzer.ts","locator":"validateActions; MAX_RULE_LENGTH, VALID_PHASES, SCORE_MIN, SCORE_MAX","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:steering-persists-config","subject":"capability:session-steering","relation":null,"object":null,"statement":"SteeringService loads bootstrap config, applies each supplied action, and saves the config after processing.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/orchestrator/services/SteeringService.ts","locator":"applySteeringActions","snapshot":null}],"derived_from":[],"gap":null}]}
```

## FOLDER STRUCTURE
<folder_structure>
```
sdk/src/orchestrator/
â””â”€â”€ SteeringAnalyzer.ts   # LLM-based steering message classifier

docs/product/
â””â”€â”€ BOOTSTRAP-CONFIG.json # Persists steeringRules[]
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
REQUIRED: Preserve `Do not narrate progress; finish with {}.` in default user rules so autonomous prompts avoid unnecessary narration.
REQUIRED: After applying a rollback action, let the orchestrator reset all in-progress tasks automatically.
REQUIRED: Use steering rules to configure phase-specific behavior constraints.
PROHIBITED: Adding duplicate rules. The system does not deduplicate automatically.
PROHIBITED: Calling `applySteeringActions` with an empty array.

## DOCUMENT MAP

```mermaid
graph TD
    THIS["SDK Steering Feature"] -->|implements| ARCH["Architecture ADR"]
    THIS -->|tested_by| TESTS["Tests ADR"]
    click ARCH "../../adr/ARCHITECTURE.md"
    click TESTS "../../adr/TESTS.md"
```

## REFERENCES
- [**SDK_CORE.md**](SDK_CORE.md): `BootstrapConfig` type and `applySteeringActions` method.
- [**SDK_AGENT_RUNNER.md**](../agents/SDK_AGENT_RUNNER.md): `IAgentRunner` interface used by `SteeringAnalyzer`.
- [**ARCHITECTURE.md**](../../adr/ARCHITECTURE.md): `SteeringAnalyzer` module responsibilities.
