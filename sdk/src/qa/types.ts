export type QaProfile = 'api' | 'web' | 'web-game'
export type QaVerdict = 'PASS' | 'FAIL' | 'BLOCKED' | 'INCONCLUSIVE'
export type QaScenarioStatus = 'PASSED' | 'FAILED' | 'BLOCKED' | 'INCONCLUSIVE'

export interface QaHttpRequest {
  method: string
  path: string
  expectedStatus: number
  headers?: Record<string, string>
  body?: string
}

export interface QaBrowserAction {
  type: 'navigate' | 'click' | 'fill' | 'press' | 'wait'
  selector?: string
  value?: string
}

export interface QaScenario {
  id: string
  criterionIds: string[]
  required: boolean
  profile: QaProfile
  description?: string
  request?: QaHttpRequest
  actions?: QaBrowserAction[]
}

export interface QaPlan {
  schemaVersion: 1
  id: string
  version: number
  target: string
  profile: QaProfile
  createdAt: string
  criteria: string[]
  scenarios: QaScenario[]
}

export interface QaEvidence {
  id: string
  path: string
  capturedAt: string
  adapter: string
}

export interface QaScenarioResult {
  scenarioId: string
  required: boolean
  status: QaScenarioStatus
  observedStatus?: number
  reason?: string
  evidence: QaEvidence[]
}

export interface QaRun {
  schemaVersion: 1
  id: string
  planId: string
  planVersion: number
  target: string
  createdAt: string
  completedAt?: string
  verdict?: QaVerdict
  results: QaScenarioResult[]
}

export interface QaPlanInput {
  planId: string
  target: string
  criteria: string[]
  profile: QaProfile
  requests?: QaHttpRequest[]
}

export interface QaDriver {
  readonly profile: QaProfile
  execute(scenario: QaScenario, target: string, evidenceDir: string, signal?: AbortSignal): Promise<QaScenarioResult>
  doctor(): Promise<{ available: boolean; reason?: string }>
}
