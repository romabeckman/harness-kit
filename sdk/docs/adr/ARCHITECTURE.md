# Arquitetura do Projeto

## OVERVIEW
TypeScript SDK implementing an autonomous TDD orchestration loop using Ports-and-Adapters structure. Uses static registry and factory to decouple agent execution strategies.

## FOLDER STRUCTURE
<folder_structure>
sdk/
├── src/                          # Main SDK source directory
│   ├── agent-runner/             # Agent runner port and built-in strategies
│   │   ├── __tests__/            # Runner unit and modular integration tests
│   │   ├── IAgentRunner.ts       # Outbound port interface for agent invocation
│   │   ├── AgentRunnerRegistry.ts# Registry for strategy registrations
│   │   ├── AgentRunnerFactory.ts # Factory to instantiate runner strategies
│   │   ├── claude-code/          # Subdirectory for Claude CLI strategy
│   │   ├── claude-agent/         # Subdirectory for Anthropic API strategy
│   │   └── antigravity/          # Subdirectory for Google Antigravity strategy
│   ├── orchestrator/             # Core state machine loop and phase chain
│   │   ├── phases/               # Chain-of-Responsibility phase handlers
│   │   ├── HarnessOrchestrator.ts# Main orchestrator implementing PhaseContext
│   │   ├── SteeringAnalyzer.ts   # LLM-based session steering message parser
│   │   └── ReentryResolver.ts    # Ordered predicate table for phase re-entry
│   ├── context-assembler/        # Per-phase structured payload builders
│   │   └── ContextAssembler.ts   # Builds PhaseAPayload, PhaseBPayload, etc.
│   ├── file-state/               # Filesystem reading and writing port/adapter
│   │   └── parsers/              # Markdown/JSON to domain object parsers
│   ├── json-extraction/          # Defensive JSON parser — never throws
│   │   └── JsonExtractionProtocol.ts # Supports top-level objects and arrays
│   ├── ui/                       # Terminal rendering utilities
│   │   ├── StartupBanner.ts      # ASCII welcome banner
│   │   ├── AnsiHelpers.ts        # Low-level ANSI escape sequences and colors
│   │   └── TerminalProgress.ts   # Animated spinner and progress bar
│   ├── telemetry/                # Usage and token tracking ledger
│   └── index.ts                  # Public package entry point and exports
└── docs/                         # Technical documentation folder
    ├── adr/                      # Architectural Decisions Records
    └── feature/                  # Feature orientations and specs
</folder_structure>

## LAYERS
- **Domain Core**: Owns the orchestrator state machine, transition logic, and phase definitions. Has zero external dependencies.
- **Inbound Port**: `IFileStateManager` abstracts all filesystem mutations.
- **Outbound Port**: `IAgentRunner` abstracts agent invocation with timeout AbortSignal propagation.
- **Strategies / Adapters**: Implements concrete execution clients (CLI, API) for target LLM agents.

## MODULES
| Module | Responsibility | Location |
|--------|-----------------|-------------|
| `AgentRunnerRegistry` | Singleton registry storing strategies constructors and validator functions. | `src/agent-runner/` |
| `AgentRunnerFactory` | Instantiates runners and executes strategy validations. Force-imports all built-in runners to trigger self-registration. | `src/agent-runner/` |
| `HarnessOrchestrator` | Core phase transitions and Chain-of-Responsibility dispatch loop. | `src/orchestrator/` |
| `SteeringAnalyzer` | LLM-based message classifier: translates developer text into structured `SteeringAction` values (`add_rule`, `rollback`, `override_score`). | `src/orchestrator/` |
| `ContextAssembler` | Builds per-phase typed payloads injecting steering rules into every agent invocation. | `src/context-assembler/` |
| `JsonExtractionProtocol` | Defensive JSON parser supporting top-level arrays and objects; never throws. Returns `ExtractionResult | ExtractionError`. | `src/json-extraction/` |
| `FileStateManager` | Atomic file reads and writes for all markdown/JSON state files. | `src/file-state/` |
| `TerminalProgress` | Animated CLI spinner and progress bar using ANSI escape codes. | `src/ui/` |
| `AnsiHelpers` | Low-level ANSI escape helpers: cursor control, color wrappers (`blue`, `cyan`, `green`, `dim`). | `src/ui/` |

## PATTERNS
REQUIRED: Use Constructor Dependency Injection to decouple ports from adapters.
REQUIRED: Spelled-out registration of new runner strategies via AgentRunnerRegistry.
REQUIRED: Propagate AbortSignal downwards to child process groups or API requests to prevent leaks.
REQUIRED: Extract numeric thresholds, limits, and configurations into named constants or configuration modules to avoid magic numbers.
FORBIDDEN: Direct dependency of orchestrator core on concrete runner implementations.
FORBIDDEN: Hardcoding inline numeric literals directly in business logic, loop limits, or configuration blocks.

<code_patterns>
# CORRECT: Strategy self-registration
AgentRunnerRegistry.register({
  type: 'custom-runner',
  constructor: CustomRunner
})

# WRONG: Direct strategy instantiation in core logic
const runner = new ClaudeCodeRunner() // Hard-coded instantiation

# CORRECT: Constants for boundaries and configurations
const MAX_BATCH_SIZE = 5
const DYNAMIC_LIMIT_MULTIPLIER = 2

const groups = Math.ceil(tasks.length / MAX_BATCH_SIZE)
const limit = groups * DYNAMIC_LIMIT_MULTIPLIER

# WRONG: Hardcoded magic numbers in calculations
const groups = Math.ceil(tasks.length / 5) // Magic number 5
const limit = groups * 2 // Magic number 2
</code_patterns>

## INTEGRATIONS
| External Service / Component | Purpose | Connection / Authentication Method |
|------------------------------|---------|-------------------------------------|
| Anthropic API | Execution of Claude Agent | API Key environment variable |
| Claude Code CLI | Local terminal coding agent | Spawn subprocess using local CLI auth |
| Antigravity CLI | Execution of Google coding agent | Spawn subprocess using agy binary |

## REFERENCES
- [**README.md**](../README.md): Main documentation index.
- [**TESTS.md**](./TESTS.md): Testing strategies and commands.
- [**sdk_agent_runner.md**](../feature/sdk_agent_runner.md): Implementation details of agent runners including strategy registration and CLI flags.
- [**sdk_core.md**](../feature/sdk_core.md): Public API surface, orchestrator types, and known limitations.
- [**sdk_terminal_ui.md**](../feature/sdk_terminal_ui.md): Terminal progress, ANSI helpers, and spinner integration.
- [**sdk_steering.md**](../feature/sdk_steering.md): Session steering analyzer and `steeringRules` configuration.
