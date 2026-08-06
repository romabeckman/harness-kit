import type { TokenEntry, TokenReport } from '../../../../../telemetry/TokenLedger'

export interface TokensTelemetryDto extends TokenReport {
  project: string
  jobId?: string
  entries: TokenEntry[]
}
