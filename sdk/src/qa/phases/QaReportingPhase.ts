import { JsonExtractionProtocol } from '../../json-extraction/JsonExtractionProtocol'
import { isExtractionResult } from '../../json-extraction/types'
import type { QaBugReport, QaBugSeverity, QaErrorReport, QaFinalReport, QaScenarioResult } from '../types'
import { QaPhase, resolveQaPhaseSettings, type QaPhaseContext, type QaPhaseHandler } from './types'

const SEVERITIES: QaBugSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

export class QaReportingPhase implements QaPhaseHandler {
  readonly phase = QaPhase.REPORTING

  async execute(context: QaPhaseContext, signal?: AbortSignal): Promise<QaPhase> {
    if (!context.plan || !context.run?.verdict) throw new Error('Agentic QA reporting requires a completed run')
    const agentSettings = resolveQaPhaseSettings(context, 'qa_reporting')
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
    context.store.saveReport(context.report)
    return QaPhase.COMPLETED
  }

  private buildPrompt(context: QaPhaseContext): string {
    return [
      'Act as an independent QA reporter.',
      'Use only supplied plan, runtime results, and evidence paths. Never invent a bug or successful check.',
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
    if (!isExtractionResult(extraction) || !isRecord(extraction.data)) throw new Error('Invalid agentic QA report: expected JSON object')
    const data = extraction.data
    const summary = typeof data.summary === 'string' && data.summary.trim() ? data.summary : `QA completed with verdict ${run.verdict}.`
    const scenarioIds = new Set(plan.scenarios.map((scenario) => scenario.id))
    const bugs = this.parseBugs(data.bugs, scenarioIds)
    const errors = this.parseErrors(data.errors, scenarioIds)

    for (const result of run.results) {
      if (result.status === 'FAILED' && !bugs.some((bug) => bug.scenarioId === result.scenarioId)) bugs.push(this.fallbackBug(result))
      if ((result.status === 'BLOCKED' || result.status === 'INCONCLUSIVE') && !errors.some((error) => error.scenarioId === result.scenarioId)) {
        errors.push({ scenarioId: result.scenarioId, message: result.reason ?? result.status })
      }
    }

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
    }
  }

  private parseBugs(value: unknown, scenarioIds: Set<string>): QaBugReport[] {
    if (!Array.isArray(value)) return []
    return value.flatMap((item) => {
      if (!isRecord(item) || typeof item.scenarioId !== 'string' || !scenarioIds.has(item.scenarioId)) return []
      if (typeof item.title !== 'string' || typeof item.expected !== 'string' || typeof item.actual !== 'string') return []
      const severity = SEVERITIES.includes(item.severity as QaBugSeverity) ? item.severity as QaBugSeverity : 'MEDIUM'
      return [{ scenarioId: item.scenarioId, title: item.title, severity, expected: item.expected, actual: item.actual, evidence: stringArray(item.evidence) }]
    })
  }

  private parseErrors(value: unknown, scenarioIds: Set<string>): QaErrorReport[] {
    if (!Array.isArray(value)) return []
    return value.flatMap((item) => {
      if (!isRecord(item) || typeof item.message !== 'string') return []
      const scenarioId = typeof item.scenarioId === 'string' && scenarioIds.has(item.scenarioId) ? item.scenarioId : undefined
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
