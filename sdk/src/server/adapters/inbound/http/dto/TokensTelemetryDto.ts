import type { TokenUsage } from '../../../../../agent-runner/types'
import type { TelemetryAuditEvent, DetailedTokenUsage } from '../../../../../telemetry/TokenLedger'

export interface TokensTelemetryQueryOptions {
  startDate?: string
  endDate?: string
  model?: string
  limit?: number
  nextToken?: string
}

export interface TokensTelemetryPagination {
  limit: number
  nextToken?: string
  totalEntries: number
  hasMore: boolean
}

export interface TokensTelemetryDto {
  project: string
  jobId?: string
  entries: TelemetryAuditEvent[]
  totals: DetailedTokenUsage
  bySkill: Record<string, DetailedTokenUsage>
  pagination?: TokensTelemetryPagination
}
