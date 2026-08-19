import type { AgentOutput } from '../agent-runner/types'

export type SessionStatus = 'pending' | 'completed'

export function isSessionStatus(value: unknown): value is SessionStatus {
  return value === 'pending' || value === 'completed'
}

export interface SessionSnapshot {
  runner: string
  model: string
  effort: string
  scopeSummary: string
  featureIds: string[]
  phaseTimingsMs: Record<string, number>
}

export function sanitizeSessionSnapshot(raw: Record<string, any>): SessionSnapshot {
  return {
    runner: String(raw.runner ?? ''),
    model: String(raw.model ?? ''),
    effort: String(raw.effort ?? ''),
    scopeSummary: String(raw.scopeSummary ?? ''),
    featureIds: Array.isArray(raw.featureIds) ? raw.featureIds.map(String) : [],
    phaseTimingsMs: typeof raw.phaseTimingsMs === 'object' && raw.phaseTimingsMs !== null
      ? Object.entries(raw.phaseTimingsMs).reduce<Record<string, number>>((acc, [k, v]) => {
          acc[k] = typeof v === 'number' ? v : 0
          return acc
        }, {})
      : {},
  }
}

export interface DiagnoseSessionRecord {
  sessionId: string
  runner: string
  agent: string
  skill?: string
  model?: string
  effort?: string
  featureId?: string
  phase?: string
  domain?: string
  durationMs?: number
  status: SessionStatus
  timestamp: string
  snapshot?: SessionSnapshot
}

export interface DiagnoseSettings {
  agent?: string
  model: string
  effort: string
}

export interface ISessionLedger {
  append(record: DiagnoseSessionRecord): void
  loadAll(): DiagnoseSessionRecord[]
  loadPending(): DiagnoseSessionRecord[]
  rewriteStatus(sessionId: string, status: SessionStatus): void
  rewriteBatchStatuses?(statusMap: Record<string, SessionStatus> | Map<string, SessionStatus>): void
}

export interface ITraceDirectoryScanner {
  getNextSequenceNumber(date?: string): number
  scanExistingSessionDirs(date?: string): string[]
}

export interface IMetaHarnessAgentAdapter {
  invoke(session: DiagnoseSessionRecord, preComputedId: string, settings?: DiagnoseSettings): Promise<AgentOutput>
  invokeMetaHarness?(session: DiagnoseSessionRecord, settings?: DiagnoseSettings): Promise<AgentOutput>
}

export interface CandidateReportInfo {
  candidateId: string
  targetSkill: string
  status?: string
  path?: string
  rationale?: string
  action?: string
  proposedChange?: string
}

export interface DiagnoseReportData {
  processedSessions: number
  remainingSessions: number
  sessionIds: string[]
  traceIds?: string[]
  candidateCreated?: CandidateReportInfo | null
  agent?: string
  model?: string
  effort?: string
  summary?: string
}
