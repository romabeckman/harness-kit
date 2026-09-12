import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { QaPlan, QaProfile, QaRun } from '../types'

export interface QaExecutionHint {
  profile: QaProfile
  target: string
  verifiedAt: string
}

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const PROFILES: QaProfile[] = ['api', 'web', 'web-game', 'mobile-web', 'accessibility', 'mcp', 'websocket', 'security', 'full']

/** Stores execution setup hints, never test outcomes or agent-authored instructions. */
export class QaExecutionMemory {
  readonly #path: string

  constructor(workspace: string) {
    this.#path = join(workspace, 'docs', 'qa', 'execution-memory.json')
  }

  read(profile?: QaProfile, target?: string): QaExecutionHint[] {
    try {
      if (statSync(this.#path).size > 16_384) return []
      const data = JSON.parse(readFileSync(this.#path, 'utf8'))
      if (data?.schemaVersion !== 1 || !Array.isArray(data.targets)) return []
      const now = Date.now()
      return data.targets.flatMap((value: unknown): QaExecutionHint[] => {
        if (!value || typeof value !== 'object') return []
        const hint = value as QaExecutionHint
        if (!PROFILES.includes(hint.profile) || typeof hint.verifiedAt !== 'string' || !safeTarget(hint.target, hint.profile)) return []
        const age = now - Date.parse(hint.verifiedAt)
        if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS || (profile && hint.profile !== profile) || (target && hint.target !== target)) return []
        return [{ profile: hint.profile, target: hint.target, verifiedAt: hint.verifiedAt }]
      }).sort((left: QaExecutionHint, right: QaExecutionHint) => right.verifiedAt.localeCompare(left.verifiedAt)).slice(0, 10)
    } catch {
      // Missing or corrupt optional memory must not prevent QA execution.
      return []
    }
  }

  remember(plan: QaPlan, run: QaRun, managed = false): void {
    if (managed || !PROFILES.includes(plan.profile) || !safeTarget(plan.target, plan.profile)) return
    if (run.target !== plan.target || run.planId !== plan.id || !run.completedAt) return
    const verified = run.results.some((result) =>
      plan.scenarios.some((scenario) => scenario.id === result.scenarioId && scenario.profile !== 'cli') &&
      (result.status === 'PASSED' || result.status === 'FAILED') && result.evidence.some((evidence) => {
        try { const file = statSync(evidence.path); return file.isFile() && file.size > 0 } catch { return false }
      }),
    )
    if (!verified) return
    const targets = [
      { profile: plan.profile, target: plan.target, verifiedAt: new Date().toISOString() },
      ...this.read().filter((hint) => hint.profile !== plan.profile),
    ].slice(0, 10)
    mkdirSync(dirname(this.#path), { recursive: true })
    const temporary = `${this.#path}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, targets }), { encoding: 'utf8', mode: 0o600 })
      renameSync(temporary, this.#path)
    } finally {
      try { unlinkSync(temporary) } catch { /* Renamed successfully or never created. */ }
    }
  }
}

function safeTarget(value: unknown, profile: QaProfile): value is string {
  if (typeof value !== 'string' || value.length > 2_048) return false
  try {
    const url = new URL(value)
    const protocols = profile === 'websocket' ? ['ws:', 'wss:'] : ['http:', 'https:']
    return protocols.includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password && !url.search && !url.hash
  } catch { return false }
}
