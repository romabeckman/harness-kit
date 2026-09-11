import type { QaScenarioResult, QaVerdict } from './types'

export class QaVerdictPolicy {
  static evaluate(results: Pick<QaScenarioResult, 'required' | 'status' | 'evidence'>[]): QaVerdict {
    const required = results.filter((result) => result.required)
    if (required.length === 0) return 'INCONCLUSIVE'
    if (required.some((result) => result.status === 'FAILED')) return 'FAIL'
    if (required.some((result) => result.status === 'BLOCKED')) return 'BLOCKED'
    if (required.some((result) => result.status === 'INCONCLUSIVE' || result.evidence.length === 0)) return 'INCONCLUSIVE'
    return 'PASS'
  }
}
