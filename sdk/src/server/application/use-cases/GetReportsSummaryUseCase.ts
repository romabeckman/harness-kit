import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { HttpServerError, HttpServerConfig } from '../../domain/types'
import { DtoMappers } from '../../adapters/inbound/http/mappers/DtoMappers'
import { TokenLedger, type TelemetryAuditEvent } from '../../../telemetry/TokenLedger'
import type { ReportsSummaryDto, AggregatedMetrics } from '../../adapters/inbound/http/dto/ReportsSummaryDto'
import type { IGetReportsSummaryUseCase } from '../ports/inbound/IGetReportsSummaryUseCase'

export class GetReportsSummaryUseCase implements IGetReportsSummaryUseCase {
  constructor(private config?: HttpServerConfig) {}

  async execute(
    projectIdentifier?: string,
    startDate?: string,
    endDate?: string
  ): Promise<ReportsSummaryDto> {
    let targetProjects: { name: string; path: string }[] = []

    const cleanProject = projectIdentifier?.trim()
    if (cleanProject) {
      const resolved = DtoMappers.resolveProjectFromEnv(cleanProject, this.config?.allowedWorkspaces)
      if (!resolved?.path) {
        throw new HttpServerError(
          400,
          'PROJECT_NOT_FOUND',
          `Project identifier '${cleanProject}' is not registered in server environment variables.`
        )
      }
      targetProjects.push({ name: cleanProject, path: resolve(resolved.path) })
    } else {
      // Find all configured projects
      let mappings: Record<string, string> = {}
      if (process.env.PROJECT_MAPPINGS) {
        try {
          mappings = JSON.parse(process.env.PROJECT_MAPPINGS)
        } catch {}
      } else if (this.config?.allowedWorkspaces) {
        if (Array.isArray(this.config.allowedWorkspaces)) {
          for (const path of this.config.allowedWorkspaces) {
            if (path) targetProjects.push({ name: path, path: resolve(path) })
          }
        } else {
          mappings = this.config.allowedWorkspaces
        }
      }

      for (const [name, path] of Object.entries(mappings)) {
        if (path) targetProjects.push({ name, path: resolve(path) })
      }
    }

    const allEvents: TelemetryAuditEvent[] = []
    const seenKeys = new Set<string>()

    for (const proj of targetProjects) {
      const candidatePaths: string[] = [
        join(proj.path, 'docs', 'product', 'tokens.jsonl'),
        join(proj.path, '.harness-kit', 'telemetry', 'tokens.jsonl'),
        join(proj.path, '.harness-kit', 'tokens.jsonl'),
        join(proj.path, 'tokens.jsonl'),
      ]

      const worktreeParent = join(proj.path, '.worktrees')
      if (existsSync(worktreeParent)) {
        try {
          const dirs = readdirSync(worktreeParent, { withFileTypes: true })
          for (const d of dirs) {
            if (d.isDirectory()) {
              const wtPath = join(worktreeParent, d.name)
              candidatePaths.push(
                join(wtPath, 'docs', 'product', 'tokens.jsonl'),
                join(wtPath, '.harness-kit', 'telemetry', 'tokens.jsonl'),
                join(wtPath, '.harness-kit', 'tokens.jsonl'),
                join(wtPath, 'tokens.jsonl')
              )
            }
          }
        } catch {}
      }

      const existingPaths = [...new Set(candidatePaths.filter((p) => existsSync(p)))]
      for (const filePath of existingPaths) {
        const ledger = new TokenLedger(filePath)
        const report = ledger.report()
        for (const event of report.events) {
          // ensure event has projectId if default
          const ev = {
            ...event,
            projectId: event.projectId !== 'default' ? event.projectId : proj.name,
          }
          const key = `${ev.auditId}-${ev.timestamp}-${ev.skill}-${ev.agent}`
          if (!seenKeys.has(key)) {
            seenKeys.add(key)
            allEvents.push(ev)
          }
        }
      }
    }

    const startMs = startDate ? new Date(startDate).getTime() : undefined
    const endMs = endDate ? new Date(endDate).getTime() : undefined

    const filteredEvents = allEvents.filter((ev) => {
      const timeMs = new Date(ev.timestamp).getTime()
      if (startMs !== undefined && !isNaN(startMs) && timeMs < startMs) return false
      if (endMs !== undefined && !isNaN(endMs) && timeMs > endMs) return false
      return true
    })

    const zero = (): AggregatedMetrics => ({
      totalCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalInvocations: 0,
    })

    const byProject: Record<string, AggregatedMetrics> = {}
    const byModel: Record<string, AggregatedMetrics> = {}
    const byAgent: Record<string, AggregatedMetrics> = {}
    const grandTotal = zero()

    const addMetrics = (target: AggregatedMetrics, ev: TelemetryAuditEvent) => {
      target.totalCostUsd += ev.tokenUsage.calculatedCostUsd
      target.inputTokens += ev.tokenUsage.inputTokens
      target.outputTokens += ev.tokenUsage.outputTokens
      target.cacheCreationTokens += ev.tokenUsage.cacheCreationTokens
      target.cacheReadTokens += ev.tokenUsage.cacheReadTokens
      target.totalInvocations += 1
    }

    for (const ev of filteredEvents) {
      const p = ev.projectId || 'unknown'
      const m = ev.model || 'unknown'
      const a = ev.agent || 'unknown'

      if (!byProject[p]) byProject[p] = zero()
      if (!byModel[m]) byModel[m] = zero()
      if (!byAgent[a]) byAgent[a] = zero()

      addMetrics(byProject[p], ev)
      addMetrics(byModel[m], ev)
      addMetrics(byAgent[a], ev)
      addMetrics(grandTotal, ev)
    }

    return {
      period: {
        startDate,
        endDate,
      },
      summary: {
        byProject,
        byModel,
        byAgent,
      },
      grandTotal,
    }
  }
}
