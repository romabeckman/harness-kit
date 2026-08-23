import type { ProductReport } from './types'
import type { ReportExportFormat } from '../../utils/report-args-parser'

export interface TelemetryExportRow {
  timestamp: string
  featureId?: string
  phase?: string
  runner?: string
  agent: string
  skill: string
  model: string
  effort: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  costUsd: number
  durationMs?: number
  status?: string
}

export class ReportExporter {
  export(report: ProductReport, format: ReportExportFormat): string {
    const rows = this.toRows(report)

    switch (format) {
      case 'json':
        return this.toJson(rows)
      case 'csv':
        return this.toCsv(rows)
    }
  }

  private toRows(report: ProductReport): TelemetryExportRow[] {
    const entries = report.tokenReport?.entries ?? []
    return entries.map((entry) => ({
      timestamp: entry.ts,
      ...(entry.featureId !== undefined ? { featureId: entry.featureId } : {}),
      ...(entry.phase !== undefined ? { phase: entry.phase } : {}),
      ...(entry.runner !== undefined ? { runner: entry.runner } : {}),
      agent: entry.agent,
      skill: entry.skill,
      model: entry.model,
      effort: entry.effort,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      cacheCreationTokens: entry.cacheCreationTokens,
      cacheReadTokens: entry.cacheReadTokens,
      costUsd: entry.costUsd,
      ...(entry.durationMs !== undefined ? { durationMs: entry.durationMs } : {}),
      ...(entry.status !== undefined ? { status: entry.status } : {}),
    }))
  }

  private toJson(rows: TelemetryExportRow[]): string {
    const payload = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      records: rows,
    }
    return JSON.stringify(payload, null, 2) + '\n'
  }

  private toCsv(rows: TelemetryExportRow[]): string {
    const headers = [
      'timestamp',
      'featureId',
      'phase',
      'runner',
      'agent',
      'skill',
      'model',
      'effort',
      'inputTokens',
      'outputTokens',
      'cacheCreationTokens',
      'cacheReadTokens',
      'costUsd',
      'durationMs',
      'status',
    ]

    const lines: string[] = [headers.join(',')]

    for (const row of rows) {
      const values = [
        this.escapeCsv(row.timestamp),
        this.escapeCsv(row.featureId ?? ''),
        this.escapeCsv(row.phase ?? ''),
        this.escapeCsv(row.runner ?? ''),
        this.escapeCsv(row.agent),
        this.escapeCsv(row.skill),
        this.escapeCsv(row.model),
        this.escapeCsv(row.effort),
        String(row.inputTokens),
        String(row.outputTokens),
        String(row.cacheCreationTokens),
        String(row.cacheReadTokens),
        String(row.costUsd),
        this.escapeCsv(row.durationMs !== undefined ? String(row.durationMs) : ''),
        this.escapeCsv(row.status ?? ''),
      ]
      lines.push(values.join(','))
    }

    return lines.join('\n') + '\n'
  }

  private escapeCsv(value: string): string {
    if (value === undefined || value === null) return ''
    const str = String(value)
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }
}
