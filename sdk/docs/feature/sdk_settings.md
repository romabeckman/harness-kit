# sdk_settings — Phase-Specific Model and Effort Settings

## OVERVIEW
Use the settings module to configure models and effort parameters per orchestration phase and agent runner. 
Export a default settings file to a global configuration location on the first execution of `hrns run`. Define project-level configuration files to override global settings.

## DIRECTORY STRUCTURE
<folder_structure>
sdk/src/settings/
├── SettingsSchema.ts     # Schema and types for Settings Map
├── DefaultSettings.ts    # Complete out-of-the-box configurations
└── HarnessSettings.ts    # Settings loader, merger, and resolver
</folder_structure>

## SCHEMA DEFINITION
Structure settings in a nested object. Use the first level for the runner type and the second level for the phase configurations:

```jsonc
// # CORRECT: Valid settings schema structure
{
  "claude-cli": {
    "phases": {
      "bootstrap":   { "model": "claude-sonnet-4-6", "effort": "high" },
      "PLANNING":     { "model": "claude-sonnet-4-6", "effort": "high" },
      "implementation":     { "model": "claude-sonnet-4-6", "effort": "medium" },
      "review_tl":  { "model": "claude-sonnet-4-6", "effort": "low" },
      "review_adv": { "model": "claude-sonnet-4-6", "effort": "low" },
      "memory":     { "model": "claude-sonnet-4-6", "effort": "medium" }
    }
  },
  "antigravity-cli": {
    "phases": {
      "bootstrap":   { "model": "gemini-3.5-flash" }
    }
  }
}
```

### Supported Phase Keys
- `bootstrap`: Bootstrap Handler
- `PLANNING`: Scope Refinement Handler
- `implementation`: TDD Implementation Handler
- `review_tl`: Grumpy Tech Lead Handler (Phase C #1)
- `review_adv`: Adversarial QA Handler (Phase C #2)
- `memory`: Project Memory/Documentation Handler

## PLATFORM-SPECIFIC SETTINGS PATHS
Resolve global configurations automatically depending on the operating system environment variables:
- **Linux/macOS/Windows**: Resolve to `$XDG_CONFIG_HOME/harness-kit/settings.json` (fall back to `~/.config/harness-kit/settings.json`).

Resolve project-specific configurations using:
- `[project path]/.harness-kit/settings.json`

## PRECEDENCE RULES
Resolve settings using the following precedence order:
1. **Project settings file** (highest priority)
2. **Global settings file**
3. **Internal Default settings** (fallback)

## INTEGRATION IN ORCHESTRATOR
Call `settings.resolve(runnerType, phaseKey)` during `HarnessOrchestrator` invocation. Inject `model` or `effort` overrides directly into the `AgentInvocation` parameters. Apply these parameters inside agent runners to override default options.

## REFERENCES
- [**README.md**](../README.md): Main documentation index.
- [**ARCHITECTURE.md**](../adr/ARCHITECTURE.md): Structural details and registry patterns.
