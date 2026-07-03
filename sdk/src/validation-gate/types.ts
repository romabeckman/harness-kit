export interface ValidationScores {
  scoreTL: number
  scoreAdv: number
  hasHighCriticalVuln: boolean
  isCrashing: boolean
  // TheGrumpyTechLead
  openPoints?: string[]
  architectureTip?: string
  // AdversarialQA
  edgeCasesMissed?: string[]
  vulnerabilities?: Array<{ type?: string, severity?: string, description?: string }>
}

export enum Verdict {
  PASS = 'PASS',
  RETRY = 'RETRY',
  BLOCK = 'BLOCK',
  FAIL = 'FAIL',
}

export interface VerdictResult {
  verdict: Verdict
  reason: string
}
