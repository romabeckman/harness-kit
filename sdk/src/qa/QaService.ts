import { CurlDriver } from './CurlDriver'
import { PlaywrightDriver } from './PlaywrightDriver'
import { QaVerdictPolicy } from './QaVerdictPolicy'
import type { QaDriver, QaPlan, QaPlanInput, QaRun } from './types'
import { QaRunStore } from './QaRunStore'
import type { QaProgressListener } from './progress'
import { probeQaTarget, type QaTargetProbe } from './QaTargetProbe'

export class QaService {
  readonly #store: QaRunStore
  readonly #drivers: Map<string, QaDriver>
  readonly #targetProbe: QaTargetProbe

  constructor(store: QaRunStore, drivers: QaDriver[] = [new CurlDriver(), new PlaywrightDriver('web'), new PlaywrightDriver('web-game')], targetProbe: QaTargetProbe = probeQaTarget) {
    this.#store = store
    this.#drivers = new Map(drivers.map((driver) => [driver.profile, driver]))
    this.#targetProbe = targetProbe
  }

  plan(input: QaPlanInput): QaPlan {
    if (input.criteria.length === 0) throw new Error('QA plan requires at least one acceptance criterion')
    new URL(input.target)
    const plan: QaPlan = {
      schemaVersion: 1,
      id: input.planId,
      version: this.#store.nextPlanVersion(input.planId),
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

  async execute(plan: QaPlan, signal?: AbortSignal, onProgress?: QaProgressListener): Promise<QaRun> {
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
    const availability = await this.#targetProbe(plan.target, signal)
    await this.executeInto(run, plan, plan.scenarios, availability, signal, onProgress)
    return this.finalize(run)
  }

  async continue(run: QaRun, plan: QaPlan, scenarios: QaPlan['scenarios'], signal?: AbortSignal, onProgress?: QaProgressListener): Promise<QaRun> {
    run.planVersion = plan.version
    const availability = await this.#targetProbe(plan.target, signal)
    await this.executeInto(run, plan, scenarios, availability, signal, onProgress)
    return this.finalize(run)
  }

  private async executeInto(run: QaRun, plan: QaPlan, scenarios: QaPlan['scenarios'], availability: { available: boolean; reason?: string }, signal?: AbortSignal, onProgress?: QaProgressListener): Promise<void> {
    for (const [index, scenario] of scenarios.entries()) {
      if (signal?.aborted) throw signal.reason ?? new Error('QA execution aborted')
      onProgress?.({
        type: 'scenario_started',
        scenarioId: scenario.id,
        description: scenario.description,
        index: index + 1,
        total: scenarios.length,
      })
      const driver = this.#drivers.get(scenario.profile)
      const result = !availability.available
        ? { scenarioId: scenario.id, required: scenario.required, status: 'BLOCKED' as const, reason: availability.reason ?? `Target unavailable at ${plan.target}`, evidence: [] }
        : driver
          ? await driver.execute(scenario, plan.target, this.#store.evidenceDir(run.id, scenario.id), signal)
          : { scenarioId: scenario.id, required: scenario.required, status: 'BLOCKED' as const, reason: `No QA driver for ${scenario.profile}`, evidence: [] }
      run.results.push(result)
      this.#store.saveRun(run)
      onProgress?.({
        type: 'scenario_completed',
        scenarioId: scenario.id,
        status: result.status,
        index: index + 1,
        total: scenarios.length,
      })
    }
  }

  private finalize(run: QaRun): QaRun {
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
