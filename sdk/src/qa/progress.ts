import type { QaAgenticRequest, QaScenarioStatus, QaVerdict } from './types'

export type QaProgressEventType = 'runtime_ready' | 'phase_started' | 'phase_completed' | 'phase_warning' | 'scenario_started' | 'scenario_completed' | 'validation_failed'
export type QaProgressPhase = 'PLANNING' | 'VALIDATION' | 'EXECUTION' | 'ANALYSIS' | 'REPORTING'

export interface QaProgressEvent {
  type: QaProgressEventType
  phase?: QaProgressPhase
  scenarioId?: string
  description?: string
  index?: number
  total?: number
  totalScenarios?: number
  status?: QaScenarioStatus
  verdict?: QaVerdict
  target?: string
  managed?: boolean
  errors?: string[]
  reason?: string
}

export type QaProgressListener = (event: QaProgressEvent) => void

export interface QaTerminalPresenter {
  start(request: QaAgenticRequest, workspace: string): void
  onProgress(event: QaProgressEvent): void
  renderReport(report: import('./types').QaFinalReport): void
}
