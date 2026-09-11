import type { QaAgenticRequest, QaScenarioStatus, QaVerdict } from './types'

export type QaProgressEventType = 'phase_started' | 'phase_completed' | 'scenario_started' | 'scenario_completed'
export type QaProgressPhase = 'PLANNING' | 'EXECUTION' | 'REPORTING'

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
}

export type QaProgressListener = (event: QaProgressEvent) => void

export interface QaTerminalPresenter {
  start(request: QaAgenticRequest, workspace: string): void
  onProgress(event: QaProgressEvent): void
  renderReport(report: import('./types').QaFinalReport): void
}
