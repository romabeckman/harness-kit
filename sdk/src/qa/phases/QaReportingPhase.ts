import { JsonExtractionProtocol } from '../../json-extraction/JsonExtractionProtocol'
import { isExtractionResult } from '../../json-extraction/types'
import type { QaBugReport, QaBugSeverity, QaCoverageArea, QaCoverageMatrix, QaErrorReport, QaFinalReport, QaScenarioCategory, QaScenarioResult } from '../types'
import { QaPhase, resolveQaPhaseSettings, type QaPhaseContext, type QaPhaseHandler } from './types'

const SEVERITIES: QaBugSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const CATEGORIES: QaScenarioCategory[] = ['functional', 'negative', 'boundary', 'security', 'accessibility', 'resilience']

export class QaReportingPhase implements QaPhaseHandler {
  readonly phase = QaPhase.REPORTING

  async execute(context: QaPhaseContext, signal?: AbortSignal): Promise<QaPhase> {
    if (!context.plan || !context.run?.verdict) throw new Error('Agentic QA reporting requires a completed run')
    const agentSettings = resolveQaPhaseSettings(context, 'qa_reporting')
    try {
      const output = await context.runner.run({
        agent: 'harness-kit:harness-qa',
        mode: 'autonomous',
        phaseKey: 'qa_reporting',
        workspacePath: context.workspace,
        model: agentSettings.model,
        effort: agentSettings.effort,
        timeoutMs: agentSettings.timeoutMs,
        session: context.session,
        prompt: this.buildPrompt(context),
      }, { signal })
      context.report = this.buildReport(context, output.raw)
    } catch {
      context.report = this.buildReport(context, '{}')
    }
    context.store.saveReport(context.report)
    return QaPhase.COMPLETED
  }

  private buildPrompt(context: QaPhaseContext): string {
    return [
      'Act as an independent QA reporter.',
      'Use only supplied plan, runtime results, and evidence paths. Never invent a bug or successful check.',
      'Use exact scenarioId values from the plan and runtime results, including their three-digit execution prefixes.',
      'Return one raw JSON object without Markdown:',
      '{"summary":"concise outcome","bugs":[{"scenarioId":"id","title":"bug","severity":"LOW|MEDIUM|HIGH|CRITICAL","expected":"expected behavior","actual":"observed behavior","evidence":["path"]}],"errors":[{"scenarioId":"id","message":"execution or environment error"}]}',
      '<qa_plan>',
      JSON.stringify(context.plan),
      '</qa_plan>',
      '<qa_run>',
      JSON.stringify(context.run),
      '</qa_run>',
    ].join('\n')
  }

  private buildReport(context: QaPhaseContext, raw: string): QaFinalReport {
    const plan = context.plan!
    const run = context.run!
    const extraction = JsonExtractionProtocol.extract(raw)
    const data = isExtractionResult(extraction) && isRecord(extraction.data) ? extraction.data : {}
    const failedResults = new Map(run.results.filter((result) => result.status === 'FAILED').map((result) => [result.scenarioId, result]))
    const bugs = deduplicateBugs(this.parseBugs(data.bugs, failedResults), run.results)
    const sharedInfrastructureError = commonBlockedReason(run.results)
    const errors = sharedInfrastructureError
      ? [{ message: sharedInfrastructureError }]
      : this.parseErrors(data.errors, new Set(run.results.filter((result) => result.status === 'BLOCKED' || result.status === 'INCONCLUSIVE').map((result) => result.scenarioId)))

    for (const result of run.results) {
      if (result.status === 'FAILED' && !bugs.some((bug) => sameRootCause(bug.actual, result.reason))) bugs.push(this.fallbackBug(result))
      if (!sharedInfrastructureError && (result.status === 'BLOCKED' || result.status === 'INCONCLUSIVE') && !errors.some((error) => error.scenarioId === result.scenarioId)) {
        errors.push({ scenarioId: result.scenarioId, message: result.reason ?? result.status })
      }
    }

    let summary = typeof data.summary === 'string' && data.summary.trim() ? data.summary : `QA completed with verdict ${run.verdict}.`
    if (run.verdict === 'FAIL' || bugs.length > 0) {
      if (/(passed|success|no issues|all checks passed|without any issue)/i.test(summary)) {
        summary = `QA completed with verdict FAIL. ${bugs.length} bug(s) identified.`
      }
    } else if (run.verdict === 'PASS') {
      if (/(failed|failure|errors found|bugs found)/i.test(summary)) {
        summary = `QA completed with verdict PASS.`
      }
    }

    const coverageMatrix = this.buildCoverageMatrix(plan, run)

    return {
      schemaVersion: 1,
      runId: run.id,
      planId: plan.id,
      verdict: run.verdict!,
      summary,
      successCriteria: plan.criteria.map((criterion, index) => {
        const criterionId = `criterion-${index + 1}`
        const related = plan.scenarios.filter((scenario) => scenario.criterionIds.includes(criterionId))
          .map((scenario) => run.results.find((result) => result.scenarioId === scenario.id))
          .filter((result): result is QaScenarioResult => result !== undefined)
        const result = related.find((item) => item.status !== 'PASSED') ?? related[0]
        return {
          criterion,
          status: result?.status ?? 'INCONCLUSIVE',
          reason: result?.reason,
          evidence: related.flatMap((item) => item.evidence.map((evidence) => evidence.path)),
        }
      }),
      bugs,
      errors,
      completedAt: run.completedAt ?? new Date().toISOString(),
      coverageMatrix,
    }
  }

  private buildCoverageMatrix(plan: QaPhaseContext['plan'] & {}, run: QaPhaseContext['run'] & {}): QaCoverageMatrix {
    const areas = {} as Record<QaScenarioCategory, QaCoverageArea>
    const testedCategories: QaScenarioCategory[] = []
    const untestedCategories: QaScenarioCategory[] = []

    for (const category of CATEGORIES) {
      const scenarios = plan.scenarios.filter((scenario) => scenario.category === category)
      const results = scenarios.map((scenario) => run.results.find((result) => result.scenarioId === scenario.id)).filter((result): result is QaScenarioResult => result !== undefined)
      const passed = results.filter((result) => result.status === 'PASSED').length
      const failed = results.filter((result) => result.status === 'FAILED').length
      const blocked = results.filter((result) => result.status === 'BLOCKED').length
      const total = scenarios.length
      const untested = total === 0 ? 1 : 0
      areas[category] = { category, total, passed, failed, blocked, untested }
      if (total > 0) {
        testedCategories.push(category)
      } else {
        untestedCategories.push(category)
      }
    }

    return { areas, testedCategories, untestedCategories }
  }

  private parseBugs(value: unknown, failedResults: Map<string, QaScenarioResult>): QaBugReport[] {
    if (!Array.isArray(value)) return []
    return value.flatMap((item) => {
      if (!isRecord(item) || typeof item.scenarioId !== 'string') return []
      const result = failedResults.get(item.scenarioId)
      if (!result) return []
      if (typeof item.title !== 'string' || typeof item.expected !== 'string' || typeof item.actual !== 'string') return []
      const severity = SEVERITIES.includes(item.severity as QaBugSeverity) ? item.severity as QaBugSeverity : 'MEDIUM'
      const validEvidenceSet = new Set(result.evidence.map((evidence) => evidence.path))
      const claimedEvidence = stringArray(item.evidence).filter((path) => validEvidenceSet.has(path))
      const evidence = claimedEvidence.length > 0 ? claimedEvidence : result.evidence.map((evidence) => evidence.path)
      return [{ scenarioId: item.scenarioId, title: item.title, severity, expected: item.expected, actual: item.actual, evidence }]
    })
  }

  private parseErrors(value: unknown, scenarioIds: Set<string>): QaErrorReport[] {
    if (!Array.isArray(value)) return []
    return value.flatMap((item) => {
      if (!isRecord(item) || typeof item.message !== 'string') return []
      if (typeof item.scenarioId === 'string' && !scenarioIds.has(item.scenarioId)) return []
      const scenarioId = typeof item.scenarioId === 'string' ? item.scenarioId : undefined
      return [{ scenarioId, message: item.message }]
    })
  }

  private fallbackBug(result: QaScenarioResult): QaBugReport {
    return {
      scenarioId: result.scenarioId,
      title: `Acceptance scenario failed: ${result.scenarioId}`,
      severity: 'HIGH',
      expected: 'Scenario satisfies its acceptance criterion.',
      actual: result.reason ?? 'Scenario failed.',
      evidence: result.evidence.map((evidence) => evidence.path),
    }
  }
}

function deduplicateBugs(bugs: QaBugReport[], results: QaScenarioResult[]): QaBugReport[] {
  const deduplicated: QaBugReport[] = []
  for (const bug of bugs) {
    const result = results.find((item) => item.scenarioId === bug.scenarioId)
    const cause = result?.reason ?? bug.actual
    if (!deduplicated.some((item) => sameRootCause(item.actual, cause))) deduplicated.push({ ...bug, actual: cause })
  }
  return deduplicated
}

function sameRootCause(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function commonBlockedReason(results: QaScenarioResult[]): string | undefined {
  const reason = results[0]?.reason
  return reason && results.length > 1 && results.every((result) => result.status === 'BLOCKED' && result.reason === reason) ? reason : undefined
}
