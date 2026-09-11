export type QaProfile = 'api' | 'web' | 'web-game' | 'mobile-web' | 'accessibility' | 'mcp' | 'cli' | 'websocket' | 'security' | 'full'
export type QaVerdict = 'PASS' | 'FAIL' | 'BLOCKED' | 'INCONCLUSIVE'
export type QaScenarioStatus = 'PASSED' | 'FAILED' | 'BLOCKED' | 'INCONCLUSIVE'

export interface QaHttpRequest {
  method: string
  path: string
  expectedStatus: number
  headers?: Record<string, string>
  body?: string
  expectedHeaders?: Record<string, string>
  expectedBodyContains?: string
  expectedJson?: unknown
}

export type QaScenarioCategory = 'functional' | 'negative' | 'boundary' | 'security' | 'accessibility' | 'resilience'

export interface QaBrowserAssertion {
  type: 'visible' | 'hidden' | 'text' | 'url' | 'count' | 'attribute'
  selector?: string
  value?: string
  count?: number
  attribute?: string
}

export interface QaBrowserAction {
  type: 'navigate' | 'click' | 'fill' | 'press' | 'wait' | 'resize'
  selector?: string
  value?: string
  count?: number
  width?: number
  height?: number
}

export interface QaMcpRequest {
  method: string
  params?: Record<string, unknown>
  expectedResultContains?: string
  expectedState?: string
  expectedReasonCode?: string
  expectedIsError?: boolean
}

export interface QaCliRequest {
  command: string
  args?: string[]
  expectedExitCode: number
  expectedStdoutContains?: string
  expectedStderrContains?: string
}

export interface QaWebSocketRequest {
  messages: string[]
  expectedMessages: string[]
}

export interface QaScenario {
  id: string
  criterionIds: string[]
  required: boolean
  profile: QaProfile
  description?: string
  category?: QaScenarioCategory
  request?: QaHttpRequest
  actions?: QaBrowserAction[]
  assertions?: QaBrowserAssertion[]
  mcp?: QaMcpRequest
  cli?: QaCliRequest
  websocket?: QaWebSocketRequest
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

export type QaBugSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface QaSuccessCriterionReport {
  criterion: string
  status: QaScenarioStatus
  reason?: string
  evidence: string[]
}

export interface QaBugReport {
  scenarioId: string
  title: string
  severity: QaBugSeverity
  expected: string
  actual: string
  evidence: string[]
}

export interface QaErrorReport {
  scenarioId?: string
  message: string
}

export interface QaCoverageArea {
  category: QaScenarioCategory
  total: number
  passed: number
  failed: number
  blocked: number
  untested: number
}

export interface QaCoverageMatrix {
  areas: Record<QaScenarioCategory, QaCoverageArea>
  testedCategories: QaScenarioCategory[]
  untestedCategories: QaScenarioCategory[]
}

export interface QaFinalReport {
  schemaVersion: 1
  runId: string
  planId: string
  verdict: QaVerdict
  summary: string
  successCriteria: QaSuccessCriterionReport[]
  bugs: QaBugReport[]
  errors: QaErrorReport[]
  completedAt: string
  coverageMatrix?: QaCoverageMatrix
}

export interface QaAgenticRequest {
  scope?: string
  scenarios?: string[]
  target?: string
  profile?: QaProfile
}

export interface QaPlanInput {
  planId: string
  target: string
  criteria: string[]
  profile: QaProfile
  scope?: string
  requests?: QaHttpRequest[]
}

export interface QaDriver {
  readonly profile: QaProfile
  execute(scenario: QaScenario, target: string, evidenceDir: string, signal?: AbortSignal): Promise<QaScenarioResult>
  doctor(): Promise<{ available: boolean; reason?: string }>
}
