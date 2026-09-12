import type {
  QaDriver,
  QaExploratoryPlanReport,
  QaExploratoryReport,
  QaExploratoryTotals,
  QaPlan,
  QaVerdict,
} from '../types'
import type { QaProgressListener } from '../progress'
import { QaPlanValidator } from './QaPlanValidator'
import { QaRunStore } from './QaRunStore'
import { QaService } from './QaService'
import type { QaTargetProbe } from './QaTargetProbe'

export interface QaExploratoryOptions {
  target?: string
  signal?: AbortSignal
  onProgress?: QaProgressListener
}

export class QaExploratoryService {
  readonly #workspace: string
  readonly #store: QaRunStore
  readonly #service: QaService

  constructor(workspace: string, store = new QaRunStore(workspace), drivers?: QaDriver[], targetProbe?: QaTargetProbe) {
    this.#workspace = workspace
    this.#store = store
    this.#service = new QaService(store, drivers, targetProbe)
  }

  async execute(options: QaExploratoryOptions = {}): Promise<QaExploratoryReport> {
    const startedAt = new Date().toISOString()
    const plans = latestPlanVersions(this.#store.listPlans())
    if (plans.length === 0) throw new Error('No saved QA plans available. Run "hrns qa run" first.')

    const planReports: QaExploratoryPlanReport[] = []
    for (const storedPlan of plans) {
      if (options.signal?.aborted) throw options.signal.reason ?? new Error('QA exploratory execution aborted')
      const plan = applyTargetOverride(storedPlan, options.target)
      try {
        const validation = await new QaPlanValidator(this.#service).validate(plan, this.#workspace, options.signal)
        if (!validation.valid) throw new Error(`QA plan validation failed: ${validation.errors.join('; ')}`)
        const run = await this.#service.execute(plan, options.signal, options.onProgress)
        planReports.push({
          planId: storedPlan.id,
          planVersion: storedPlan.version,
          profile: storedPlan.profile,
          target: plan.target,
          runId: run.id,
          verdict: run.verdict ?? 'INCONCLUSIVE',
          results: run.results,
        })
      } catch (error) {
        if (options.signal?.aborted) throw error
        planReports.push({
          planId: storedPlan.id,
          planVersion: storedPlan.version,
          profile: storedPlan.profile,
          target: plan.target,
          verdict: 'BLOCKED',
          results: [],
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const totals = aggregateTotals(planReports)
    const completedAt = new Date().toISOString()
    const report: QaExploratoryReport = {
      schemaVersion: 1,
      id: createExploratoryId(completedAt),
      startedAt,
      completedAt,
      verdict: aggregateVerdict(planReports),
      totals,
      plans: planReports,
    }
    this.#store.saveExploratoryReport(report)
    return report
  }
}

function latestPlanVersions(plans: QaPlan[]): QaPlan[] {
  const latest = new Map<string, QaPlan>()
  for (const plan of plans) {
    const current = latest.get(plan.id)
    if (!current || plan.version > current.version) latest.set(plan.id, plan)
  }
  return [...latest.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
}

function applyTargetOverride(plan: QaPlan, target?: string): QaPlan {
  if (!target || plan.profile === 'cli') return plan
  return { ...plan, target }
}

function aggregateTotals(plans: QaExploratoryPlanReport[]): QaExploratoryTotals {
  const results = plans.flatMap((plan) => plan.results)
  return {
    plans: plans.length,
    scenarios: results.length,
    passed: results.filter((result) => result.status === 'PASSED').length,
    failed: results.filter((result) => result.status === 'FAILED').length,
    blocked: results.filter((result) => result.status === 'BLOCKED').length,
    inconclusive: results.filter((result) => result.status === 'INCONCLUSIVE').length,
  }
}

function aggregateVerdict(plans: QaExploratoryPlanReport[]): QaVerdict {
  const verdicts = new Set(plans.map((plan) => plan.verdict))
  if (verdicts.has('FAIL')) return 'FAIL'
  if (verdicts.has('BLOCKED')) return 'BLOCKED'
  if (verdicts.has('INCONCLUSIVE')) return 'INCONCLUSIVE'
  return 'PASS'
}

function createExploratoryId(timestamp: string): string {
  return `exploratory-${timestamp.replace(/[-:.TZ]/g, '')}-${Math.random().toString(36).slice(2, 8)}`
}
