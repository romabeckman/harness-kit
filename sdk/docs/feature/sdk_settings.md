# sdk_settings — Phase-Specific Model and Effort Settings

## OVERVIEW
The settings module allows developers to configure models and effort parameters per orchestration phase and agent runner.
On the first execution of `hrns run`, a default settings file is exported to a global configuration location. Developers can also define project-level configuration files to override global settings.

## DIRECTORY STRUCTURE
<folder_structure>
sdk/src/settings/
├── SettingsSchema.ts     # Schema and types for Settings Map
├── DefaultSettings.ts    # Complete out-of-the-box configurations
└── HarnessSettings.ts    # Settings loader, merger, and resolver
</folder_structure>

## SCHEMA DEFINITION
Settings are structured in a nested object, where the first level represents the runner type and the second level defines the phase configurations:

```json
{
  "claude-code": {
    "phases": {
      "bootstrap":   { "model": "claude-sonnet-4-6", "effort": "high" },
      "phase_a":     { "model": "claude-sonnet-4-6", "effort": "high" },
      "phase_b":     { "model": "claude-sonnet-4-6", "effort": "medium" },
      "phase_c_tl":  { "model": "claude-sonnet-4-6", "effort": "low" },
      "phase_c_adv": { "model": "claude-sonnet-4-6", "effort": "low" },
      "phase_e":     { "model": "claude-sonnet-4-6", "effort": "medium" }
    }
  },
  "antigravity": {
    "phases": {
      "bootstrap":   { "model": "gemini-3.5-flash" }
    }
  }
}
```

### Supported Phase Keys
- `bootstrap`: Bootstrap Handler
- `phase_a`: Scope Refinement Handler
- `phase_b`: TDD Implementation Handler
- `phase_c_tl`: Grumpy Tech Lead Handler (Phase C #1)
- `phase_c_adv`: Adversarial QA Handler (Phase C #2)
- `phase_e`: Project Memory/Documentation Handler

## PLATFORM-SPECIFIC SETTINGS PATHS
Global configuration is saved automatically to the filesystem depending on the operating system:
- **Linux/macOS**: Resolves to `$XDG_CONFIG_HOME/harness-kit/settings.json` (falls back to `~/.config/harness-kit/settings.json`).
- **Windows**: Resolves to `%APPDATA%\harness-kit\settings.json` (falls back to `~/.config/harness-kit/settings.json` if `%APPDATA%` environment variable is not defined).

Project-specific configuration path:
- `[project path]/.harness-kit/settings.json`

## PRECEDENCE RULES
When resolving settings for an agent invocation, values are merged with the following precedence order:
1. **Project settings file** (highest priority)
2. **Global settings file**
3. **Internal Default settings** (fallback)

## INTEGRATION IN ORCHESTRATOR
During invocation, `HarnessOrchestrator` calls `settings.resolve(runnerType, phaseKey)`. If the configuration contains `model` or `effort` overrides, they are injected directly into the `AgentInvocation` parameters. Agent runners apply these parameters to override their default options.

## REFERENCES
- [**README.md**](../README.md): Main documentation index.
- [**ARCHITECTURE.md**](../adr/ARCHITECTURE.md): Structural details and registry patterns.
