import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { QaFinalReport, QaPlan, QaRun } from './types'

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

export class QaRunStore {
  readonly #root: string

  constructor(workspace: string) {
    this.#root = join(workspace, '.harness-kit', 'qa')
  }

  planPath(planId: string, version: number): string {
    this.assertIdentifier(planId)
    if (!Number.isSafeInteger(version) || version < 1) throw new Error('Invalid QA plan version')
    return join(this.#root, 'plans', planId, `${version}.json`)
  }

  nextPlanVersion(planId: string): number {
    this.assertIdentifier(planId)
    const directory = join(this.#root, 'plans', planId)
    if (!existsSync(directory)) return 1
    const versions = readdirSync(directory).flatMap((name) => {
      const match = /^(\d+)\.json$/.exec(name)
      return match ? [Number.parseInt(match[1], 10)] : []
    })
    return (versions.length ? Math.max(...versions) : 0) + 1
  }

  runPath(runId: string): string {
    this.assertIdentifier(runId)
    return join(this.#root, 'runs', runId, 'state.json')
  }

  evidenceDir(runId: string, scenarioId: string): string {
    this.assertIdentifier(runId)
    this.assertIdentifier(scenarioId)
    return join(this.#root, 'runs', runId, 'evidence', scenarioId)
  }

  reportPath(runId: string): string {
    this.assertIdentifier(runId)
    return join(this.#root, 'runs', runId, 'report.json')
  }

  savePlan(plan: QaPlan): void {
    const path = this.planPath(plan.id, plan.version)
    if (existsSync(path)) throw new Error(`QA plan version already exists: ${plan.id}/${plan.version}`)
    this.writeJson(path, plan)
  }

  loadPlan(planId: string, version: number): QaPlan {
    return this.readJson<QaPlan>(this.planPath(planId, version), 'QA plan')
  }

  saveRun(run: QaRun): void {
    this.writeJson(this.runPath(run.id), run)
  }

  loadRun(runId: string): QaRun {
    return this.readJson<QaRun>(this.runPath(runId), 'QA run')
  }

  saveReport(report: QaFinalReport): void {
    this.writeJson(this.reportPath(report.runId), report)
  }

  loadReport(runId: string): QaFinalReport {
    return this.readJson<QaFinalReport>(this.reportPath(runId), 'QA report')
  }

  private assertIdentifier(value: string): void {
    if (!SAFE_IDENTIFIER.test(value)) throw new Error('Invalid QA identifier')
  }

  private writeJson(path: string, value: unknown): void {
    const directory = dirname(path)
    mkdirSync(directory, { recursive: true })
    const temporaryPath = join(directory, `.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    writeFileSync(temporaryPath, JSON.stringify(value, null, 2), 'utf8')
    renameSync(temporaryPath, path)
  }

  private readJson<T>(path: string, label: string): T {
    if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as T
    } catch {
      throw new Error(`${label} is not valid JSON: ${path}`)
    }
  }
}
