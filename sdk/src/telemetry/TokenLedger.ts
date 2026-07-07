import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { TokenUsage } from '../agent-runner/types'

export interface TokenEntry extends TokenUsage {
  ts: string
  skill: string
  agent: string
  model: string
  effort: string
}

export interface TokenReport {
  entries: TokenEntry[]
  totals: TokenUsage
  bySkill: Record<string, TokenUsage>
}

export class TokenLedger {
  readonly #ledgerPath: string

  constructor(ledgerPath: string) {
    this.#ledgerPath = ledgerPath
  }

  record(skill: string, agent: string, usage: TokenUsage): void {
    const entry: TokenEntry = {
      ts: new Date().toISOString(),
      skill,
      agent,
      model: usage.model ?? 'unknown',
      effort: usage.effort ?? 'default',
      ...usage,
    }
    const dir = dirname(this.#ledgerPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    appendFileSync(this.#ledgerPath, JSON.stringify(entry) + '\n', 'utf8')
  }

  report(): TokenReport {
    const entries: TokenEntry[] = []
    if (existsSync(this.#ledgerPath)) {
      for (const line of readFileSync(this.#ledgerPath, 'utf8').split('\n')) {
        if (!line.trim()) continue
        try { entries.push(JSON.parse(line) as TokenEntry) } catch { /* skip malformed */ }
      }
    }

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

    return { entries, totals, bySkill }
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
