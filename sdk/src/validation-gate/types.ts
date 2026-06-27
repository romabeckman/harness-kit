export interface ValidationScores {
  scoreTL: number
  scoreAdv: number
  hasHighCriticalVuln: boolean
  isCrashing: boolean
}

export enum Verdict {
  PASS  = 'PASS',
  RETRY = 'RETRY',
  BLOCK = 'BLOCK',
  FAIL  = 'FAIL',
}

export interface VerdictResult {
  verdict: Verdict
  reason: string
}
