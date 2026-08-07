import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { HttpServerError, HttpServerConfig } from '../../domain/types'
import { DtoMappers } from '../../adapters/inbound/http/mappers/DtoMappers'
import { TokenLedger, type TelemetryAuditEvent, type DetailedTokenUsage } from '../../../telemetry/TokenLedger'
import type { TokensTelemetryDto, TokensTelemetryQueryOptions } from '../../adapters/inbound/http/dto/TokensTelemetryDto'
import type { IGetTokensTelemetryUseCase } from '../ports/inbound/IGetTokensTelemetryUseCase'

export class GetTokensTelemetryUseCase implements IGetTokensTelemetryUseCase {
  constructor(private config?: HttpServerConfig) {}

  async execute(
    projectIdentifier?: string,
    jobId?: string,
    options?: TokensTelemetryQueryOptions
  ): Promise<TokensTelemetryDto> {
    if (!projectIdentifier || projectIdentifier.trim() === '') {
      throw new HttpServerError(
        400,
        'MISSING_PROJECT_PARAMETER',
        "Parameter 'project' is required (e.g. GET /orchestrator/tokens?project=backend)."
      )
    }

    const name = projectIdentifier.trim()
    const fromEnv = DtoMappers.resolveProjectFromEnv(name, this.config?.allowedWorkspaces)
    if (!fromEnv?.path) {
      throw new HttpServerError(
        400,
        'PROJECT_NOT_FOUND',
        `Project identifier '${name}' is not registered in server environment variables.`
      )
    }

    const targetPath = resolve(fromEnv.path)
    const cleanJobId = jobId?.trim()

    let candidatePaths: string[] = []

    if (cleanJobId) {
      const worktreeDir = join(targetPath, '.worktrees', cleanJobId)
      candidatePaths = [
        join(worktreeDir, 'docs', 'product', 'tokens.jsonl'),
        join(worktreeDir, '.harness-kit', 'telemetry', 'tokens.jsonl'),
        join(worktreeDir, '.harness-kit', 'tokens.jsonl'),
        join(worktreeDir, 'tokens.jsonl'),
        join(targetPath, 'docs', 'product', 'tokens.jsonl'),
        join(targetPath, '.harness-kit', 'telemetry', 'tokens.jsonl'),
        join(targetPath, '.harness-kit', 'tokens.jsonl'),
        join(targetPath, 'tokens.jsonl'),
      ]
    } else {
      candidatePaths = [
        join(targetPath, 'docs', 'product', 'tokens.jsonl'),
        join(targetPath, '.harness-kit', 'telemetry', 'tokens.jsonl'),
        join(targetPath, '.harness-kit', 'tokens.jsonl'),
        join(targetPath, 'tokens.jsonl'),
      ]

      const worktreeParent = join(targetPath, '.worktrees')
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
    }

    const existingPaths = [...new Set(candidatePaths.filter((p) => existsSync(p)))]

    const allEvents: TelemetryAuditEvent[] = []
    for (const filePath of existingPaths) {
      const ledger = new TokenLedger(filePath)
      const r = ledger.report()
      for (const ev of r.events) {
        if (cleanJobId && ev.jobId && ev.jobId !== cleanJobId) {
          continue
        }
        allEvents.push({
          ...ev,
          projectId: ev.projectId !== 'default' ? ev.projectId : name,
        })
      }
    }

    const uniqueEvents: TelemetryAuditEvent[] = []
    const seenKeys = new Set<string>()

    for (const ev of allEvents) {
      const key = `${ev.auditId}-${ev.timestamp}-${ev.skill}-${ev.agent}-${ev.tokenUsage.inputTokens}`
      if (!seenKeys.has(key)) {
        seenKeys.add(key)
        uniqueEvents.push(ev)
      }
    }

    // Filters: startDate, endDate, model
    const startMs = options?.startDate ? new Date(options.startDate).getTime() : undefined
    const endMs = options?.endDate ? new Date(options.endDate).getTime() : undefined
    const filterModel = options?.model?.trim().toLowerCase()

    const filteredEvents = uniqueEvents.filter((ev) => {
      const timeMs = new Date(ev.timestamp).getTime()
      if (startMs !== undefined && !isNaN(startMs) && timeMs < startMs) return false
      if (endMs !== undefined && !isNaN(endMs) && timeMs > endMs) return false
      if (filterModel && !ev.model.toLowerCase().includes(filterModel)) return false
      return true
    })

    const zero = (): DetailedTokenUsage => ({
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      calculatedCostUsd: 0,
    })

    const totals = zero()
    const bySkill: Record<string, DetailedTokenUsage> = {}

    for (const e of filteredEvents) {
      totals.inputTokens += e.tokenUsage.inputTokens
      totals.outputTokens += e.tokenUsage.outputTokens
      totals.cacheCreationTokens += e.tokenUsage.cacheCreationTokens
      totals.cacheReadTokens += e.tokenUsage.cacheReadTokens
      totals.calculatedCostUsd += e.tokenUsage.calculatedCostUsd

      if (!bySkill[e.skill]) bySkill[e.skill] = zero()
      bySkill[e.skill].inputTokens += e.tokenUsage.inputTokens
      bySkill[e.skill].outputTokens += e.tokenUsage.outputTokens
      bySkill[e.skill].cacheCreationTokens += e.tokenUsage.cacheCreationTokens
      bySkill[e.skill].cacheReadTokens += e.tokenUsage.cacheReadTokens
      bySkill[e.skill].calculatedCostUsd += e.tokenUsage.calculatedCostUsd
    }

    // Pagination Slicing
    let offset = 0
    if (options?.nextToken) {
      try {
        const decoded = Buffer.from(options.nextToken, 'base64').toString('utf-8')
        const parsed = parseInt(decoded, 10)
        if (!isNaN(parsed) && parsed >= 0) offset = parsed
      } catch {
        const parsed = parseInt(options.nextToken, 10)
        if (!isNaN(parsed) && parsed >= 0) offset = parsed
      }
    }

    const limit = Math.max(1, Math.min(options?.limit ? Number(options.limit) : 50, 500))
    const slicedEntries = filteredEvents.slice(offset, offset + limit)
    const hasMore = offset + limit < filteredEvents.length
    const nextToken = hasMore
      ? Buffer.from(String(offset + limit)).toString('base64')
      : undefined

    return {
      project: name,
      ...(cleanJobId ? { jobId: cleanJobId } : {}),
      entries: slicedEntries,
      totals,
      bySkill,
      pagination: {
        limit,
        ...(nextToken ? { nextToken } : {}),
        totalEntries: filteredEvents.length,
        hasMore,
      },
    }
  }
}
