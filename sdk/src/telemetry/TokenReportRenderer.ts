import type { TokenEntry, TokenReport } from './TokenLedger'

/** Keep small counts exact; compact millions only at the presentation boundary. */
export function formatTokens(tokens: number): string {
  return tokens >= 1_000_000
    ? `${(tokens / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`
    : tokens.toLocaleString('pt-BR')
}

function modelFamily(model: string): string {
  const name = model.toLowerCase()
  const family = name.match(/(?:^|[-_/.])(flash[-_]?lite|hydrogen|carbon|argon|neon|flash|pro|sonnet|haiku|opus|fable|mythos|astra|terra|sol|luna|mini|nano)(?=$|[-_/.])/)
  if (!family) return 'Unrecognized model'
  const label = family[1].split(/[-_]/).map(part => part[0].toUpperCase() + part.slice(1)).join('-')
  const provider = name.includes('gemini') ? 'Gemini' : /claude|fable|mythos/.test(name) ? 'Claude' : 'GPT'
  return `${provider} ${label}`
}

/** Normalize only runners with a verified input accounting contract. */
function cacheInputShare(entries: TokenEntry[]): number | undefined {
  let totalInput = 0
  let totalCached = 0
  for (const entry of entries) {
    const { inputTokens, cacheReadTokens, cacheCreationTokens } = entry
    if (![inputTokens, cacheReadTokens, cacheCreationTokens].every(n => Number.isFinite(n) && n >= 0)) return undefined
    if (inputTokens === 0 && cacheReadTokens === 0 && cacheCreationTokens === 0) continue
    let input: number
    if (entry.runner === 'codex-cli') {
      // Cached input is a subset of the reported input tokens.
      input = inputTokens
    } else if (entry.runner === 'claude-cli' || entry.runner === 'claude-sdk') {
      // Anthropic reports uncached, cache-write and cache-read input separately.
      input = inputTokens + cacheCreationTokens + cacheReadTokens
    } else {
      return undefined
    }
    if (cacheReadTokens > input) return undefined
    totalInput += input
    totalCached += cacheReadTokens
  }
  return totalInput > 0 ? totalCached / totalInput * 100 : undefined
}

export function printTokenReport(report: TokenReport): void {
  const { entries, totals, bySkill } = report
  const fmt = (n: number) => formatTokens(n).padStart(10)
  const usd = (n: number) => `$${n.toFixed(4)}`

  // collect unique models and efforts seen across entries
  const models = [...new Set(entries.map(e => modelFamily(e.model)).filter(Boolean))]
  const efforts = [...new Set(entries.map(e => e.effort).filter(e => e && e !== 'default'))]

  // Estimated USD saved per cached input token, averaged by model tier.
  // These tier averages are indicative, not provider billing rates.
  const RATE_EXTRA_LARGE = 3.7 / 1_000_000
  const RATE_LARGE = 2.1 / 1_000_000
  const RATE_MEDIUM = 0.9 / 1_000_000
  const RATE_FAST = 0.2 / 1_000_000

  const modelRate = (model: string, timestamp: string): number => {
    const m = model.toLowerCase()
    // Family reference savings (input minus cache read), USD/1M tokens.
    // Google Standard rates checked 2026-11-28: https://aistudio.google.com/docs/pricing
    if (/gemini-.*neon/.test(m)) return 2.85 / 1_000_000
    if (/gemini-.*hydrogen/.test(m)) return 1.425 / 1_000_000
    if (/gemini-.*(?:carbon|argon)/.test(m)) {
      const date = timestamp.slice(0, 10)
      return (date < '2026-12-01' ? 1.9 : 3.8) / 1_000_000
    }
    if (/flash.?lite|haiku|gpt-.*-(?:mini|nano|luna)\b/.test(m)) return RATE_FAST
    if (/gpt-.*-terra\b/.test(m)) return RATE_MEDIUM
    if (/gpt-.*-sol\b|sonnet|gemini-.*pro/.test(m)) return RATE_LARGE
    if (/fable|mythos|opus|gpt-.*-astra\b|gpt-5\.5|gpt-4o|gpt-4\.1(?!-(?:mini|nano))|\bo3\b/.test(m)) return RATE_EXTRA_LARGE
    if (/gpt-5(?:\.1)?(?:\b|-)|gpt-3\.5|claude-2|gemini-.*flash/.test(m)) return RATE_MEDIUM
    // Unknown models cannot contribute a reliable savings estimate.
    return 0
  }

  // Sum per entry so each model contributes according to its cached tokens.
  const cacheSaved = entries.reduce(
    (sum, entry) => sum + entry.cacheReadTokens * modelRate(entry.model, entry.ts),
    0,
  )

  console.log('\nharness-kit-sdk — token report')
  if (models.length) console.log(`  model:  ${models.join(', ')}`)
  if (efforts.length) console.log(`  effort: ${efforts.join(', ')}`)
  console.log('─'.repeat(Math.min(process.stdout.columns || 80, 80)))
  console.log(`${'skill'.padEnd(28)} ${'input'.padStart(10)} ${'output'.padStart(10)} ${'cache read'.padStart(10)}`)
  console.log('─'.repeat(Math.min(process.stdout.columns || 80, 80)))

  for (const [skill, u] of Object.entries(bySkill)) {
    console.log(
      `${skill.padEnd(28)} ${fmt(u.inputTokens)} ${fmt(u.outputTokens)} ${fmt(u.cacheReadTokens)}`
    )
  }

  console.log('─'.repeat(Math.min(process.stdout.columns || 80, 80)))
  console.log(
    `${'TOTAL'.padEnd(28)} ${fmt(totals.inputTokens)} ${fmt(totals.outputTokens)} ${fmt(totals.cacheReadTokens)}`
  )
  const cacheShare = cacheInputShare(entries)
  if (cacheShare !== undefined) {
    const percentage = cacheShare.toLocaleString('en-US', { maximumFractionDigits: 1 })
    console.log(`  ${percentage}% of input tokens were served from cache.`)
  }
  if (totals.cacheReadTokens > 0) console.log(`  With cache, you saved approximately ${usd(cacheSaved)}`)

  console.log('  * Estimated savings based on average rates per model family.')
  console.log()
}
