import { CurlDriver } from './CurlDriver'
import { PlaywrightDriver } from './PlaywrightDriver'
import { QaVerdictPolicy } from './QaVerdictPolicy'
import type { QaDriver, QaPlan, QaPlanInput, QaRun } from './types'
import { QaRunStore } from './QaRunStore'

export class QaService {
  readonly #store: QaRunStore
  readonly #drivers: Map<string, QaDriver>

  constructor(store: QaRunStore, drivers: QaDriver[] = [new CurlDriver(), new PlaywrightDriver('web'), new PlaywrightDriver('web-game')]) {
    this.#store = store
    this.#drivers = new Map(drivers.map((driver) => [driver.profile, driver]))
  }

  plan(input: QaPlanInput): QaPlan {
    if (input.criteria.length === 0) throw new Error('QA plan requires at least one acceptance criterion')
    new URL(input.target)
    const plan: QaPlan = {
      schemaVersion: 1,
      id: input.planId,
      version: 1,
      target: input.target,
      profile: input.profile,
      createdAt: new Date().toISOString(),
      criteria: input.criteria,
      scenarios: input.criteria.map((criterion, index) => ({
        id: `scenario-${index + 1}`,
        criterionIds: [`criterion-${index + 1}`],
        required: true,
        profile: input.profile,
        description: criterion,
        request: input.requests?.[index],
      })),
    }
    this.#store.savePlan(plan)
    return plan
  }

  async execute(plan: QaPlan, signal?: AbortSignal): Promise<QaRun> {
    const run: QaRun = {
      schemaVersion: 1,
      id: this.createRunId(plan.id),
      planId: plan.id,
      planVersion: plan.version,
      target: plan.target,
      createdAt: new Date().toISOString(),
      results: [],
    }
    this.#store.saveRun(run)
    for (const scenario of plan.scenarios) {
      const driver = this.#drivers.get(scenario.profile)
      const result = driver
        ? await driver.execute(scenario, plan.target, this.#store.evidenceDir(run.id, scenario.id), signal)
        : { scenarioId: scenario.id, required: scenario.required, status: 'BLOCKED' as const, reason: `No QA driver for ${scenario.profile}`, evidence: [] }
      run.results.push(result)
      this.#store.saveRun(run)
    }
    run.verdict = QaVerdictPolicy.evaluate(run.results)
    run.completedAt = new Date().toISOString()
    this.#store.saveRun(run)
    return run
  }

  async doctor(profile: QaPlan['profile']): Promise<{ available: boolean; reason?: string }> {
    const driver = this.#drivers.get(profile)
    return driver ? driver.doctor() : { available: false, reason: `No QA driver for ${profile}` }
  }

  private createRunId(planId: string): string {
    const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '')
    return `${planId}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`
  }
}
