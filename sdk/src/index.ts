// ─── Public API ──────────────────────────────────────────────────────────────
// HarnessOrchestrator — main entry point
export { HarnessOrchestrator } from './orchestrator/HarnessOrchestrator'
export type { HarnessOrchestratorOptions } from './orchestrator/HarnessOrchestrator'
export { ChainBuilder } from './orchestrator/ChainBuilder'

// Orchestrator types
export { Phase, CliCommand } from './orchestrator/types'
export type {
  OrchestratorConfig,
  OrchestratorState,
  PhaseTransition,
} from './orchestrator/types'
export { SteeringAnalyzer } from './orchestrator/SteeringAnalyzer'
export type { SteeringAction } from './orchestrator/SteeringAnalyzer'

// Agent runner interface and null implementation
export type { IAgentRunner } from './agent-runner/IAgentRunner'
export { NullAgentRunner } from './agent-runner/NullAgentRunner'
export type { AgentInvocation, AgentOutput, ContextPayload } from './agent-runner/types'

// Agent runner — ClaudeCLIRunner (default, uses local claude CLI)
export { ClaudeCLIRunner } from './agent-runner/claude-cli/ClaudeCLIRunner'

// Agent runner — ClaudeSDKRunner (CI/CD, requires ANTHROPIC_API_KEY)
export { ClaudeSDKRunner } from './agent-runner/claude-sdk/ClaudeSDKRunner'
export { AgentRunnerError, AgentRunnerErrorCode } from './agent-runner/AgentRunnerError'
export type { AgentRunnerConfig } from './agent-runner/claude-sdk/AgentRunnerConfig'

// Modular runner registry & factory, and built-in runners
export { AgentRunnerRegistry } from './agent-runner/AgentRunnerRegistry'
export type { RunnerRegistration } from './agent-runner/AgentRunnerRegistry'
export { AgentRunnerFactory } from './agent-runner/AgentRunnerFactory'
export { AbstractCliRunner } from './agent-runner/AbstractCliRunner'
export { DebugContext } from './cli/DebugContext'
export { AntigravityCLIRunner } from './agent-runner/antigravity-cli/AntigravityCLIRunner'
export { CopilotSDKRunner } from './agent-runner/copilot-sdk/CopilotSDKRunner'
export type { CopilotSDKRunnerConfig } from './agent-runner/copilot-sdk/CopilotSDKRunner'
export { CursorSDKRunner } from './agent-runner/cursor-sdk/CursorSDKRunner'
export type { CursorSDKRunnerConfig } from './agent-runner/cursor-sdk/CursorSDKRunner'
export { KiroCLIRunner } from './agent-runner/kiro-cli/KiroCLIRunner'
export { CodexCLIRunner } from './agent-runner/codex-cli/CodexCLIRunner'

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
  PlanningPayload,
  DevelopmenPayload,
  ReviewPayload,
  MemoryPayload,
} from './context-assembler/types'

// HTTP Server
export { HttpServer, startHttpServer } from './server'
export { HttpServerError } from './server/types'
export type {
  HttpServerConfig,
  HealthStatusVo,
  OpenApiSpec,
  OrchestrationJob,
  JobStatus,
  RunRequestDto,
  RunRequestDtoExtended,
  RunResponseDto,
  JobStatusDto,
} from './server'

// Diagnose
export { DiagnoseService } from './diagnose/DiagnoseService'
export { JsonlSessionLedger } from './diagnose/JsonlSessionLedger'
export { SessionIdGenerator } from './diagnose/SessionIdGenerator'
export { TraceDirectoryScanner } from './diagnose/TraceDirectoryScanner'
export { MetaHarnessAgentAdapter } from './diagnose/MetaHarnessAgentAdapter'
export { CandidateReader } from './diagnose/CandidateReader'
export { CandidatePromotionService } from './diagnose/CandidatePromotionService'
export { DiagnoseReportRenderer } from './diagnose/DiagnoseReportRenderer'
export { DiagnosePaths } from './diagnose/utils/DiagnosePaths'
export type {
  SessionStatus,
  SessionSnapshot,
  DiagnoseSessionRecord,
  DiagnoseSettings,
  CandidateReportInfo,
  DiagnoseReportData,
  ISessionLedger,
  ITraceDirectoryScanner,
  IMetaHarnessAgentAdapter,
} from './diagnose/types'


