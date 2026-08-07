export interface AggregatedMetrics {
  totalCostUsd: number
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  totalInvocations: number
}

export interface ReportsSummaryDto {
  period: {
    startDate?: string
    endDate?: string
  }
  summary: {
    byProject: Record<string, AggregatedMetrics>
    byModel: Record<string, AggregatedMetrics>
    byAgent: Record<string, AggregatedMetrics>
  }
  grandTotal: AggregatedMetrics
}
