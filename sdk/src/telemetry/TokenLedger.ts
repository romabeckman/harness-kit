import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { TokenUsage } from '../agent-runner/types'

export interface ExecutionMetrics {
  durationMs: number
  status: 'success' | 'error' | string
}

export interface DetailedTokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  calculatedCostUsd: number
}

export interface TelemetryAuditEvent {
  auditId: string
  jobId?: string
  projectId: string
  tenantId?: string
  userId?: string
  timestamp: string
  agent: string
  model: string
  skill: string
  effort?: string
  featureId?: string
  phase?: string
  runner?: string
  executionMetrics: ExecutionMetrics
  tokenUsage: DetailedTokenUsage
}

export interface TokenEntry extends TokenUsage {
  ts: string
  skill: string
  agent: string
  model: string
  effort: string
  featureId?: string
  phase?: string
  runner?: string
  durationMs?: number
  status?: string
  auditId?: string
  jobId?: string
  projectId?: string
  tenantId?: string
  userId?: string
  executionMetrics?: ExecutionMetrics
  tokenUsage?: DetailedTokenUsage
}

export interface TokenReport {
  entries: TokenEntry[]
  events: TelemetryAuditEvent[]
  totals: TokenUsage
  bySkill: Record<string, TokenUsage>
}

export function normalizeTelemetryEvent(raw: any): TelemetryAuditEvent {
  const effort = raw?.effort ?? raw?.tokenUsage?.effort
  const featureId = raw?.featureId ?? raw?.tokenUsage?.featureId
  const phase = raw?.phase ?? raw?.tokenUsage?.phase
  const runner = raw?.runner ?? raw?.tokenUsage?.runner

  if (raw && typeof raw === 'object' && raw.tokenUsage && typeof raw.tokenUsage === 'object') {
    const tu = raw.tokenUsage
    const em = raw.executionMetrics ?? {}
    return {
      auditId: raw.auditId ?? `aud_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      jobId: raw.jobId,
      projectId: raw.projectId ?? raw.project ?? 'default',
      tenantId: raw.tenantId ?? 'default',
      userId: raw.userId ?? 'system',
      timestamp: raw.timestamp ?? raw.ts ?? new Date().toISOString(),
      agent: raw.agent ?? 'unknown',
      model: raw.model ?? 'unknown',
      skill: raw.skill ?? 'unknown',
      ...(effort ? { effort } : {}),
      ...(featureId ? { featureId } : {}),
      ...(phase ? { phase } : {}),
      ...(runner ? { runner } : {}),
      executionMetrics: {
        durationMs: typeof em.durationMs === 'number' ? em.durationMs : (typeof raw.durationMs === 'number' ? raw.durationMs : 0),
        status: em.status ?? raw.status ?? 'success',
      },
      tokenUsage: {
        inputTokens: typeof tu.inputTokens === 'number' ? tu.inputTokens : 0,
        outputTokens: typeof tu.outputTokens === 'number' ? tu.outputTokens : 0,
        cacheCreationTokens: typeof tu.cacheCreationTokens === 'number' ? tu.cacheCreationTokens : 0,
        cacheReadTokens: typeof tu.cacheReadTokens === 'number' ? tu.cacheReadTokens : 0,
        calculatedCostUsd: typeof tu.calculatedCostUsd === 'number' ? tu.calculatedCostUsd : (typeof tu.costUsd === 'number' ? tu.costUsd : 0),
      },
    }
  }

  // Legacy flat format normalization
  const inputTokens = typeof raw.inputTokens === 'number' ? raw.inputTokens : 0
  const outputTokens = typeof raw.outputTokens === 'number' ? raw.outputTokens : 0
  const cacheCreationTokens = typeof raw.cacheCreationTokens === 'number' ? raw.cacheCreationTokens : 0
  const cacheReadTokens = typeof raw.cacheReadTokens === 'number' ? raw.cacheReadTokens : 0
  const calculatedCostUsd = typeof raw.costUsd === 'number' ? raw.costUsd : (typeof raw.calculatedCostUsd === 'number' ? raw.calculatedCostUsd : 0)

  return {
    auditId: raw.auditId ?? `aud_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    jobId: raw.jobId,
    projectId: raw.projectId ?? raw.project ?? 'default',
    tenantId: raw.tenantId ?? 'default',
    userId: raw.userId ?? 'system',
    timestamp: raw.timestamp ?? raw.ts ?? new Date().toISOString(),
    agent: raw.agent ?? 'unknown',
    model: raw.model ?? 'unknown',
    skill: raw.skill ?? 'unknown',
    ...(effort ? { effort } : {}),
    ...(featureId ? { featureId } : {}),
    ...(phase ? { phase } : {}),
    ...(runner ? { runner } : {}),
    executionMetrics: {
      durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : (raw.executionMetrics?.durationMs ?? 0),
      status: raw.status ?? raw.executionMetrics?.status ?? 'success',
    },
    tokenUsage: {
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens,
      calculatedCostUsd,
    },
  }
}

export class TokenLedger {
  readonly #ledgerPath: string

  constructor(ledgerPath: string) {
    this.#ledgerPath = ledgerPath
  }

  record(skill: string, agent: string, usage: TokenUsage & Record<string, any>): void {
    const inputTokens = usage.inputTokens ?? 0
    const outputTokens = usage.outputTokens ?? 0
    const cacheCreationTokens = usage.cacheCreationTokens ?? 0
    const cacheReadTokens = usage.cacheReadTokens ?? 0
    const calculatedCostUsd = usage.costUsd ?? usage.calculatedCostUsd ?? 0
    const timestamp = usage.timestamp ?? usage.ts ?? new Date().toISOString()

    const event: any = {
      auditId: usage.auditId ?? `aud_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      jobId: usage.jobId,
      projectId: usage.projectId ?? usage.project ?? 'default',
      tenantId: usage.tenantId ?? 'default',
      userId: usage.userId ?? 'system',
      timestamp,
      ts: timestamp,
      agent,
      model: usage.model ?? 'unknown',
      skill,
      effort: usage.effort ?? 'default',
      executionMetrics: {
        durationMs: usage.durationMs ?? 0,
        status: usage.status ?? 'success',
      },
      tokenUsage: {
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        calculatedCostUsd,
      },
    }
    if (usage.featureId) event.featureId = usage.featureId
    if (usage.phase) event.phase = usage.phase
    if (usage.runner) event.runner = usage.runner

    const dir = dirname(this.#ledgerPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    appendFileSync(this.#ledgerPath, JSON.stringify(event) + '\n', 'utf8')
  }

  recordAudit(event: Partial<TelemetryAuditEvent> & Record<string, any>): void {
    const inputTokens = event.tokenUsage?.inputTokens ?? event.inputTokens ?? 0
    const outputTokens = event.tokenUsage?.outputTokens ?? event.outputTokens ?? 0
    const cacheCreationTokens = event.tokenUsage?.cacheCreationTokens ?? event.cacheCreationTokens ?? 0
    const cacheReadTokens = event.tokenUsage?.cacheReadTokens ?? event.cacheReadTokens ?? 0
    const calculatedCostUsd = event.tokenUsage?.calculatedCostUsd ?? event.costUsd ?? 0
    const timestamp = event.timestamp ?? event.ts ?? new Date().toISOString()

    const fullEvent: any = {
      auditId: event.auditId ?? `aud_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      jobId: event.jobId,
      projectId: event.projectId ?? 'default',
      tenantId: event.tenantId ?? 'default',
      userId: event.userId ?? 'system',
      timestamp,
      ts: timestamp,
      agent: event.agent ?? 'unknown',
      model: event.model ?? 'unknown',
      skill: event.skill ?? 'unknown',
      effort: event.effort ?? 'default',
      executionMetrics: {
        durationMs: event.executionMetrics?.durationMs ?? 0,
        status: event.executionMetrics?.status ?? 'success',
      },
      tokenUsage: {
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        calculatedCostUsd,
      },
    }
    if (event.featureId) fullEvent.featureId = event.featureId
    if (event.phase) fullEvent.phase = event.phase
    if (event.runner) fullEvent.runner = event.runner

    const dir = dirname(this.#ledgerPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    appendFileSync(this.#ledgerPath, JSON.stringify(fullEvent) + '\n', 'utf8')
  }

  report(): TokenReport {
    const rawEntries: any[] = []
    if (existsSync(this.#ledgerPath)) {
      for (const line of readFileSync(this.#ledgerPath, 'utf8').split('\n')) {
        if (!line.trim()) continue
        try { rawEntries.push(JSON.parse(line)) } catch { /* skip malformed */ }
      }
    }

    const events: TelemetryAuditEvent[] = rawEntries.map(normalizeTelemetryEvent)
    const entries: TokenEntry[] = events.map((ev) => ({
      ts: ev.timestamp,
      skill: ev.skill,
      agent: ev.agent,
      model: ev.model,
      effort: ev.effort ?? 'default',
      featureId: ev.featureId,
      phase: ev.phase,
      runner: ev.runner,
      durationMs: ev.executionMetrics?.durationMs,
      status: ev.executionMetrics?.status,
      auditId: ev.auditId,
      jobId: ev.jobId,
      projectId: ev.projectId,
      tenantId: ev.tenantId,
      userId: ev.userId,
      inputTokens: ev.tokenUsage.inputTokens,
      outputTokens: ev.tokenUsage.outputTokens,
      cacheCreationTokens: ev.tokenUsage.cacheCreationTokens,
      cacheReadTokens: ev.tokenUsage.cacheReadTokens,
      costUsd: ev.tokenUsage.calculatedCostUsd,
      executionMetrics: ev.executionMetrics,
      tokenUsage: ev.tokenUsage,
    }))

    const zero = (): TokenUsage => ({
      inputTokens: 0, outputTokens: 0,
      cacheCreationTokens: 0, cacheReadTokens: 0, costUsd: 0,
    })

    const totals = zero()
    const bySkill: Record<string, TokenUsage> = {}

    for (const e of entries) {
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

    return { entries, events, totals, bySkill }
  }

  printReport(): void {
    const { entries, totals, bySkill } = this.report()
    const fmt = (n: number) => n.toLocaleString('en-US').padStart(8)
    const usd = (n: number) => `$${n.toFixed(4)}`

    // collect unique models and efforts seen across entries
    const models = [...new Set(entries.map(e => e.model).filter(Boolean))]
    const efforts = [...new Set(entries.map(e => e.effort).filter(e => e && e !== 'default'))]

    // Estimated USD saved per cached input token, averaged by model tier.
    // These tier averages are indicative, not provider billing rates.
    const RATE_EXTRA_LARGE = 3.7 / 1_000_000
    const RATE_LARGE = 2.1 / 1_000_000
    const RATE_MEDIUM = 0.9 / 1_000_000
    const RATE_FAST = 0.2 / 1_000_000

    const modelRate = (model: string): number => {
      const m = model.toLowerCase()
      if (/flash.?lite|haiku|gpt-.*-(?:mini|nano|luna)\b/.test(m)) return RATE_FAST
      if (/gpt-.*-terra\b/.test(m)) return RATE_MEDIUM
      if (/gpt-.*-sol\b|sonnet|gemini-.*pro/.test(m)) return RATE_LARGE
      if (/fable|mythos|opus|gpt-.*-astra\b|gpt-5\.5|gpt-4o|gpt-4\.1(?!-(?:mini|nano))|\bo3\b/.test(m)) return RATE_EXTRA_LARGE
      if (/gpt-5(?:\.1)?(?:\b|-)|gpt-3\.5|claude-2|gemini-.*flash/.test(m)) return RATE_MEDIUM
      // Unrecognized models use the large tier.
      return RATE_LARGE
    }

    // Sum per entry so each model contributes according to its cached tokens.
    const cacheSaved = entries.reduce(
      (sum, entry) => sum + entry.cacheReadTokens * modelRate(entry.model),
      0,
    )

    console.log('\nharness-kit-sdk — token report')
    if (models.length) console.log(`  model:  ${models.join(', ')}`)
    if (efforts.length) console.log(`  effort: ${efforts.join(', ')}`)
    console.log('─'.repeat(68))
    console.log(`${'skill'.padEnd(28)} ${'input'.padStart(8)} ${'output'.padStart(8)} ${'cache_r'.padStart(8)}  cost`)
    console.log('─'.repeat(68))

    for (const [skill, u] of Object.entries(bySkill)) {
      console.log(
        `${skill.padEnd(28)} ${fmt(u.inputTokens)} ${fmt(u.outputTokens)} ${fmt(u.cacheReadTokens)}  ${usd(u.costUsd)}`
      )
    }

    console.log('─'.repeat(68))
    console.log(
      `${'TOTAL'.padEnd(28)} ${fmt(totals.inputTokens)} ${fmt(totals.outputTokens)} ${fmt(totals.cacheReadTokens)}  ${usd(totals.costUsd)}`
    )
    if (totals.cacheReadTokens > 0) console.log(`  cache_read saved ~${usd(cacheSaved)}`)

    console.log('  * Note: cache savings use estimated rates; costs come from recorded usage.')
    console.log()
  }
}
