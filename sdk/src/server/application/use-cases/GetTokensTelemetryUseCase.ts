import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { HttpServerError, HttpServerConfig } from '../../domain/types'
import { DtoMappers } from '../../adapters/inbound/http/mappers/DtoMappers'
import type { TokenUsage } from '../../../agent-runner/types'
import { TokenLedger, type TokenEntry } from '../../../telemetry/TokenLedger'
import type { TokensTelemetryDto } from '../../adapters/inbound/http/dto/TokensTelemetryDto'
import type { IGetTokensTelemetryUseCase } from '../ports/inbound/IGetTokensTelemetryUseCase'

export class GetTokensTelemetryUseCase implements IGetTokensTelemetryUseCase {
  constructor(private config?: HttpServerConfig) {}

  async execute(projectIdentifier?: string, jobId?: string): Promise<TokensTelemetryDto> {
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

    const allEntries: TokenEntry[] = []
    for (const filePath of existingPaths) {
      const ledger = new TokenLedger(filePath)
      const r = ledger.report()
      for (const entry of r.entries) {
        if (cleanJobId && (entry as any).jobId && (entry as any).jobId !== cleanJobId) {
          continue
        }
        allEntries.push(entry)
      }
    }

    const uniqueEntries: TokenEntry[] = []
    const seenKeys = new Set<string>()

    for (const entry of allEntries) {
      const key = `${entry.ts}-${entry.skill}-${entry.agent}-${entry.inputTokens}-${entry.outputTokens}`
      if (!seenKeys.has(key)) {
        seenKeys.add(key)
        uniqueEntries.push(entry)
      }
    }

    const zero = (): TokenUsage => ({
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      costUsd: 0,
    })

    const totals = zero()
    const bySkill: Record<string, TokenUsage> = {}

    for (const e of uniqueEntries) {
      totals.inputTokens += e.inputTokens
      totals.outputTokens += e.outputTokens
      totals.cacheCreationTokens += e.cacheCreationTokens
      totals.cacheReadTokens += e.cacheReadTokens
      totals.costUsd += e.costUsd

      if (!bySkill[e.skill]) bySkill[e.skill] = zero()
      bySkill[e.skill].inputTokens += e.inputTokens
      bySkill[e.skill].outputTokens += e.outputTokens
      bySkill[e.skill].cacheCreationTokens += e.cacheCreationTokens
      bySkill[e.skill].cacheReadTokens += e.cacheReadTokens
      bySkill[e.skill].costUsd += e.costUsd
    }

    return {
      project: name,
      ...(cleanJobId ? { jobId: cleanJobId } : {}),
      entries: uniqueEntries,
      totals,
      bySkill,
    }
  }
}
