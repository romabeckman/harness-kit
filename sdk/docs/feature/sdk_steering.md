# sdk_steering — Session Steering

## OVERVIEW

The `sdk_steering` module allows developers to inject runtime directives when resuming an orchestration session. A free-text steering message is analyzed by an LLM and translated into structured `SteeringAction` values that modify `BOOTSTRAP-CONFIG.json` or roll back the orchestrator's phase state.

---

## FOLDER STRUCTURE

<folder_structure>
sdk/src/orchestrator/
└── SteeringAnalyzer.ts   # LLM-based steering message classifier

docs/product/
└── BOOTSTRAP-CONFIG.json # Persists steeringRules[] alongside phase and cycle state
</folder_structure>

---

## STEERING ACTIONS

| Action Type | Fields | Effect |
|---|---|---|
| `add_rule` | `rule: string` | Appends the rule string to `BOOTSTRAP-CONFIG.json#steeringRules[]`. Injected into all future phase payloads via `ContextAssembler`. |
| `rollback` | `targetPhase: Phase` | Sets `currentPhase` to the target phase in both in-memory state and `BOOTSTRAP-CONFIG.json`. Resets all active tasks to `NOT_STARTED` when rolling back to `PHASE_A` or `PHASE_B`. |
| `override_score` | `tl?: number; adv?: number` | Overwrites `scoreTL` and `scoreAdv` on the active feature. Forces the next validation to use the provided scores. |

---

## BOOTSTRAPCONFIG SCHEMA

```typescript
interface BootstrapConfig {
  currentPhase: Phase
  cycleCounter: { completedCycles: number }
  steeringRules?: string[]   // Persistent developer rules injected into every agent payload
}
```

`steeringRules` defaults to `[]` when the key is absent from the JSON file. The `BootstrapConfigParser` applies this default during deserialization.

---

## FLOW

```
hrns run --agent antigravity
  → user selects: resume
  → user types: "todo código em português"
  → SteeringAnalyzer.analyze(message, runner)
      → LLM returns JSON array: [{ "type": "add_rule", "rule": "todo código em português" }]
      → JsonExtractionProtocol.extract() parses the array
  → orchestrator.applySteeringActions(actions)
      → BOOTSTRAP-CONFIG.json#steeringRules updated
      → DECISIONS.md entry appended
  → orchestrator.run() continues from current phase
      → ContextAssembler injects steeringRules into all payloads
```

---

## STEERINGANALYZER CONTRACT

```typescript
class SteeringAnalyzer {
  static async analyze(msg: string, runner: IAgentRunner): Promise<SteeringAction[]>
}
```

REQUIRED: Pass a valid `IAgentRunner` instance — `SteeringAnalyzer` invokes the runner to call the LLM.

REQUIRED: The CLI (`run.ts`) falls back to `AgentRunnerFactory.create({ type: 'claude-code' })` when no explicit `--agent` flag is provided, ensuring steering always works regardless of agent selection.

FORBIDDEN: Do not call `applySteeringActions` with an empty array — check `actions.length > 0` before applying.

---

## CONTEXT INJECTION

`ContextAssembler` reads `steeringRules` from `BootstrapConfig` and appends them to every phase payload. All agents receive the rules as part of their prompt context on every invocation after the rules are added.

```typescript
// CORRECT: rules automatically included in phase payload
const payload = ContextAssembler.buildPhaseAPayload(feature, paths, steeringRules)

// WRONG: omit rules — agents never see the developer's constraints
const payload = ContextAssembler.buildPhaseAPayload(feature, paths)
```

---

## BEST PRACTICES

REQUIRED: Keep steering rules concise and imperative — the LLM reads them verbatim as constraints.
REQUIRED: After applying a rollback action, the orchestrator resets all in-progress tasks to `NOT_STARTED` automatically. Do not manually reset tasks after a rollback.
FORBIDDEN: Do not add duplicate rules — `applySteeringActions` does not deduplicate; check `steeringRules` in `BOOTSTRAP-CONFIG.json` before adding if idempotency is required.

---

## KNOWN LIMITATIONS

1. **No deduplication** — `add_rule` unconditionally appends. The same rule added twice will appear twice in every future payload.
2. **Single rollback per resume** — Multiple rollback actions in one message will each apply sequentially; only the last target phase will be effective.

---

## REFERENCES

- [**sdk_core.md**](./sdk_core.md): `BootstrapConfig` type, `applySteeringActions` method on `HarnessOrchestrator`.
- [**sdk_agent_runner.md**](./sdk_agent_runner.md): `IAgentRunner` interface used by `SteeringAnalyzer`.
- [**ARCHITECTURE.md**](../adr/ARCHITECTURE.md): `SteeringAnalyzer` module responsibilities and location.
