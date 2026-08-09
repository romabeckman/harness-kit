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
  executionMetrics: ExecutionMetrics
  tokenUsage: DetailedTokenUsage
}

export interface TokenEntry extends TokenUsage {
  ts: string
  skill: string
  agent: string
  model: string
  effort: string
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
      executionMetrics: {
        durationMs: typeof em.durationMs === 'number' ? em.durationMs : 0,
        status: em.status ?? 'success',
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

    const event = {
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

    const fullEvent = {
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
      effort: 'default',
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

    // cache_read rate per token by tier (source: Anthropic, OpenAI, Google pricing Jun 2026)
    // extra_large ~$0.916/MTok: gpt-4o $1.25, Fable5 $1.00, Opus $0.50, gpt-5.5 $0.50, o3 $0.50, gpt-4.1 $0.50
    // large       ~$0.235/MTok: Sonnet $0.30, gpt-5.4 $0.25, Gemini3.1Pro $0.20, gpt-5.2 $0.175
    // medium      ~$0.108/MTok: Gemini3.5Flash $0.15, gpt-5/5.1 $0.125, Haiku $0.10, gpt-4.1-mini $0.10
    // fast        ~$0.045/MTok: gpt-4o-mini $0.075, Gemini3Flash $0.05, gpt-4.1-nano $0.025, gpt-5-mini $0.025, GeminiFlashLite $0.025
    const RATE_EXTRA_LARGE = 0.000000916
    const RATE_LARGE = 0.000000235
    const RATE_MEDIUM = 0.000000108
    const RATE_FAST = 0.000000045

    const isExtraLargeModel = (m: string) => /fable|mythos|opus|gemini.*ultra|gpt-5\.5(?!-(?:mini|nano))/i.test(m)

    // Agora exige explicitamente o "lite" junto do flash para ser considerado FAST
    const isFastModel = (m: string) => /haiku|mini|nano|flash.?lite/i.test(m)

    // Adicionado o "flash" geral aqui. Como o isFastModel roda antes, o flash-lite já terá sido filtrado.
    const isMediumModel = (m: string) => /gpt-3\.5|claude-2|flash/i.test(m)

    const modelRate = (m: string) =>
      isExtraLargeModel(m) ? RATE_EXTRA_LARGE :
        isFastModel(m) ? RATE_FAST :
          isMediumModel(m) ? RATE_MEDIUM :
            RATE_LARGE

    const cacheReadRate = models.length > 0
      ? models.reduce((sum, m) => sum + modelRate(m), 0) / models.length
      : RATE_LARGE

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
    const cacheSaved = totals.cacheReadTokens > 0
      ? `  cache_read saved ~${usd(totals.cacheReadTokens * cacheReadRate)}`
      : ''
    if (cacheSaved) console.log(cacheSaved)

    console.log('  * Note: all costs are estimated tier averages, not real pricing.')
    console.log()
  }
}
