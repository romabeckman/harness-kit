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
│   │   ├── ClaudeCodeRunner.ts   # Local Claude CLI runner adapter
│   │   ├── ClaudeAgentRunner.ts  # Anthropic SDK agent runner adapter
│   │   └── AntigravityRunner.ts  # Google Antigravity CLI runner adapter
│   ├── orchestrator/             # Core state machine loop
│   ├── file-state/               # Filesystem reading and writing port/adapter
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
| `AgentRunnerFactory` | Instantiates runners and executes strategy validations. | `src/agent-runner/` |
| `StateMachine` | Core phase transitions. | `src/orchestrator/` |
| `FileStateManager` | Atomic file reads and writes. | `src/file-state/` |

## PATTERNS
REQUIRED: Use Constructor Dependency Injection to decouple ports from adapters.
REQUIRED: Spelled-out registration of new runner strategies via AgentRunnerRegistry.
REQUIRED: Propagate AbortSignal downwards to child process groups or API requests to prevent leaks.
FORBIDDEN: Direct dependency of orchestrator core on concrete runner implementations.

<code_patterns>
# REQUIRED: Strategy self-registration
AgentRunnerRegistry.register({
  type: 'custom-runner',
  constructor: CustomRunner
})

# FORBIDDEN: Direct strategy instantiation in core logic
const runner = new ClaudeCodeRunner() // Hard-coded instantiation
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
- [**sdk_agent_runner.md**](../feature/sdk_agent_runner.md): Implementation details of ClaudeAgentRunner and ClaudeCodeRunner.
