import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const INLINE_THRESHOLD = 5000

export function inlineOrReference(
  label: string,
  content: string | undefined,
  filePath: string,
  lang: string = 'markdown'
): string[] {
  if (!content) return []

  if (content.length < INLINE_THRESHOLD) {
    return [`<${label}>`, `\`\`\`${lang}`, content, '```', `</${label}>`]
  }

  return [
    `<${label}_ref>`,
    `Read file: \`${filePath}\` (content too large to inline — ${content.length} chars)`,
    `\`\`\`${lang}`,
    content,
    '```',
    `</${label}_ref>`,
  ]
}

/**
 * §4.2: Shared evaluation principle for TL and QA review prompts.
 * Single source of truth — prevents divergence between the two review agents.
 */
export const EVALUATION_PRINCIPLE_TL = [
  `<evaluation_principle>`,
  `Before adding ANY item to openPoints, verify it against all three of these:`,
  `1. Evidence: you can point to an exact file and line (or exact area) in the CURRENT code where the flaw actually exists — not a hypothetical, a "could happen", or a style preference.`,
  `2. Impact: you can state a concrete, reproducible consequence (crash, data loss, security breach, incorrect behavior, maintainability (real maintenance risk), complexity, performance degradation, testability, readability, scalability, extensibility, modularity, coupling, cohesion, error handling, logging, monitoring, observability, memory usage, cpu usage, disk usage, network usage, concurrency, parallelism, distribution, persistence, caching).`,
  `3. Proportional severity: the [CRITICAL]/[HIGH]/[MEDIUM]/[LOW] label matches the actual impact. Do NOT escalate a minor issue to CRITICAL/HIGH just to make the review look thorough or to force a rework cycle.`,
  `Finding zero issues could be a valid and expected outcome when the code genuinely deserves it. You are not being evaluated on how many problems you find — you are being evaluated on accuracy.`,
  `If, after reading the code and specs, nothing meets this bar, return "openPoints": [] and a score that reflects genuinely solid work (e.g. 0.90–1.00). A fabricated or inflated finding is a WORSE outcome than an honest "no issues found", because it triggers an unnecessary rework cycle and wastes effort on a non-problem.`,
  `</evaluation_principle>`,
].join('\n')

export const EVALUATION_PRINCIPLE_QA = [
  `<evaluation_principle>`,
  `Before adding ANY item to vulnerabilities or edgeCasesMissed, verify:`,
  `1. Evidence: you can point to the exact file/function/line in the CURRENT code where the flaw exists.`,
  `2. Exploitability / reproducibility: for a vulnerability, you can describe a concrete trigger or exploit path — not a generic "this pattern can sometimes be risky" note. For an edge case, it must be a scenario the code demonstrably fails, not one it merely wasn't explicitly tested against while still behaving correctly.`,
  `3. Proportional severity: LOW/MEDIUM/HIGH/CRITICAL must match real impact. Do NOT inflate severity to force a RETRY.`,
  `Finding zero issues could be a valid and expected outcome when the code genuinely deserves it. You are not being evaluated on how many problems you find — you are being evaluated on accuracy.`,
  `If the implementation genuinely covers the scenarios in the test-scenarios spec and no real vulnerability exists, return "vulnerabilities": [], "edgeCasesMissed": [], "passedAdversarial": true, "hasHighCriticalVuln": false, and a score reflecting that robustness. A fabricated or inflated finding is a WORSE outcome than an honest pass — it triggers an unnecessary rework cycle on a non-problem.`,
  `</evaluation_principle>`,
].join('\n')

/**
 * §4.6: Shared rework directive builder for TL and QA review prompts.
 * Prevents re-reporting of already-fixed issues across rework cycles.
 */
export function buildReworkSection(reworkLogPath: string, totalReworks: number, reworkLogExists: boolean): string[] {
  if (!reworkLogExists) return []

  return [
    `<rework_history totalReworks="${totalReworks}">`,
    `Read the file \`${reworkLogPath}\` to know what was fixed in previous rounds.`,
    `</rework_history>`,
    ``,
    `<rework_directive round="${totalReworks}">`,
    `This is rework validation round ${totalReworks}. You MUST:`,
    `1. Read the rework_history above carefully`,
    `2. Check which previous findings have been FIXED in the current code`,
    `3. REMOVE fixed items from your findings — do NOT re-report resolved issues`,
    `4. Only report issues that REMAIN UNFIXED or are NEW`,
    `5. If a previous finding was partially fixed, describe what remains`,
    `6. Your score MUST reflect the CURRENT state of the code after rework, not historical issues`,
    `7. If all previous findings are resolved and no new critical issues exist, score accordingly`,
    `</rework_directive>`,
    ``,
  ]
}

/**
 * Reads docs/.digest.md and docs/.graph.json from each project path (and workingDir) if present,
 * and formats them for injection directly into phase execution prompts.
 */
export function buildDocsOrientationSection(projectPaths: string[], workingDir?: string): string[] {
  const targets: string[] = []
  if (Array.isArray(projectPaths)) {
    targets.push(...projectPaths)
  }
  if (workingDir) {
    targets.push(workingDir)
  }

  if (targets.length === 0) {
    return []
  }

  const resolvedPaths: string[] = []
  for (const t of targets) {
    if (!t) continue
    const fullPath = resolve(workingDir ?? '.', t)
    if (!resolvedPaths.includes(fullPath)) {
      resolvedPaths.push(fullPath)
    }
  }

  const lines: string[] = []

  for (const projPath of resolvedPaths) {
    const digestPath = join(projPath, 'docs', '.digest.md')
    const graphPath = join(projPath, 'docs', '.graph.json')

    let digestContent: string | undefined
    if (existsSync(digestPath)) {
      try {
        digestContent = readFileSync(digestPath, 'utf-8')
      } catch {
        // ignore
      }
    }

    let graphContent: string | undefined
    if (existsSync(graphPath)) {
      try {
        graphContent = readFileSync(graphPath, 'utf-8')
      } catch {
        // ignore
      }
    }

    if (digestContent || graphContent) {
      lines.push(`<project_orientation path="${projPath}">`)

      if (digestContent) {
        lines.push(...inlineOrReference('digest_md', digestContent, join(projPath, 'docs', '.digest.md'), 'markdown'))
      }

      if (graphContent) {
        lines.push(...inlineOrReference('graph_json', graphContent, join(projPath, 'docs', '.graph.json'), 'json'))
      }

      lines.push('</project_orientation>')
    }
  }

  if (lines.length > 0) {
    lines.push('')
  }

  return lines
}

