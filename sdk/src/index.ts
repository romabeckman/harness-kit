// ─── Public API ──────────────────────────────────────────────────────────────
// HarnessOrchestrator — main entry point
export { HarnessOrchestrator } from './orchestrator/HarnessOrchestrator'
export type { HarnessOrchestratorOptions } from './orchestrator/HarnessOrchestrator'

// Orchestrator types
export { Phase } from './orchestrator/types'
export type {
  OrchestratorConfig,
  OrchestratorState,
  PhaseTransition,
} from './orchestrator/types'

// Agent runner interface and null implementation
export type { IAgentRunner } from './agent-runner/IAgentRunner'
export { NullAgentRunner } from './agent-runner/NullAgentRunner'
export type { AgentInvocation, AgentOutput, ContextPayload } from './agent-runner/types'

// Agent runner — ClaudeCodeRunner (default, uses local claude CLI)
export { ClaudeCodeRunner } from './agent-runner/ClaudeCodeRunner'
export type { ClaudeCodeRunnerConfig } from './agent-runner/ClaudeCodeRunner'

// Agent runner — ClaudeAgentRunner (CI/CD, requires ANTHROPIC_API_KEY)
export { ClaudeAgentRunner } from './agent-runner/ClaudeAgentRunner'
export { AgentRunnerError, AgentRunnerErrorCode } from './agent-runner/AgentRunnerError'
export type { AgentRunnerConfig } from './agent-runner/AgentRunnerConfig'

// File state types
export type {
  Feature,
  Task,
  BootstrapConfig,
  FeatureStatus,
  TaskStatus,
  CurrentPhase,
  DecisionEntry,
} from './file-state/types'

// FileStateManager (implementation + interface)
export { FileStateManager } from './file-state/FileStateManager'
export type { IFileStateManager, FileStateManagerOptions } from './file-state/FileStateManager'

// Validation gate
export { ValidationGate } from './validation-gate/ValidationGate'
export { Verdict } from './validation-gate/types'
export type { ValidationScores, VerdictResult } from './validation-gate/types'

// JSON extraction protocol
export { JsonExtractionProtocol } from './json-extraction/JsonExtractionProtocol'
export { isExtractionError, isExtractionResult } from './json-extraction/types'
export type { ExtractionResult, ExtractionError, ExtractionOutcome } from './json-extraction/types'

// Telemetry
export { TokenLedger } from './telemetry/TokenLedger'
export type { TokenEntry, TokenReport } from './telemetry/TokenLedger'
export type { TokenUsage } from './agent-runner/types'

// Context assembler
export { ContextAssembler } from './context-assembler/ContextAssembler'
export type {
  PhaseAPayload,
  PhaseBPayload,
  PhaseCPayload,
  PhaseEPayload,
} from './context-assembler/types'
