import { JsonExtractionProtocol } from '../../json-extraction/JsonExtractionProtocol'
import { isExtractionResult } from '../../json-extraction/types'
import { QaPlanningPhase } from './QaPlanningPhase'
import { QaPlanValidator } from '../services/QaPlanValidator'
import { QaPhase, resolveQaPhaseSettings, type QaPhaseContext, type QaPhaseHandler } from './types'

const MAX_ANALYSIS_CYCLES = 3

export class QaAnalysisPhase implements QaPhaseHandler {
  readonly phase = QaPhase.ANALYSIS

  async execute(context: QaPhaseContext, signal?: AbortSignal): Promise<QaPhase> {
    if (!context.plan || !context.run) throw new Error('Agentic QA analysis requires a completed execution')
    context.analysisCycles = (context.analysisCycles ?? 0) + 1
    if (context.analysisCycles > MAX_ANALYSIS_CYCLES) return QaPhase.REPORTING
    const agentSettings = resolveQaPhaseSettings(context, 'qa_analysis')
    const output = await context.runner.run({
      agent: 'harness-kit:harness-qa', mode: 'autonomous', phaseKey: 'qa_analysis', workspacePath: context.workspace,
      model: agentSettings.model, effort: agentSettings.effort, timeoutMs: agentSettings.timeoutMs, session: context.session,
      prompt: this.buildPrompt(context),
    }, { signal })
    context.session = output.session ?? context.session
    const extraction = JsonExtractionProtocol.extract(output.raw)
    if (!isExtractionResult(extraction) || !isRecord(extraction.data)) throw new Error('Invalid agentic QA analysis: expected JSON object')
    if (extraction.data.complete === true || !isRecord(extraction.data.plan)) return QaPhase.REPORTING

    const previous = context.plan
    const revised = new QaPlanningPhase().parse(JSON.stringify(extraction.data.plan), context.request, context.store.nextPlanVersion(previous.id))
    if (revised.id !== previous.id || revised.target !== previous.target || revised.profile !== previous.profile) throw new Error('Invalid agentic QA analysis: plan identity and target cannot change')
    if (!previous.criteria.every((criterion, index) => revised.criteria[index] === criterion)) throw new Error('Invalid agentic QA analysis: existing criteria cannot change')
    const previousIds = new Set(previous.scenarios.map((scenario) => scenario.id))
    if (!previous.scenarios.every((scenario) => revised.scenarios.some((candidate) => candidate.id === scenario.id))) throw new Error('Invalid agentic QA analysis: existing scenarios cannot be removed')
    const additional = revised.scenarios.filter((scenario) => !previousIds.has(scenario.id))
    if (additional.length === 0) return QaPhase.REPORTING
    const validation = await new QaPlanValidator(context.service).validate(revised, context.workspace, signal)
    if (!validation.valid) {
      context.onProgress?.({ type: 'validation_failed', phase: QaPhase.VALIDATION, errors: validation.errors })
      throw new Error(['QA plan validation failed:', ...validation.errors.map((error) => `- ${error}`)].join('\n'))
    }
    context.store.savePlan(revised)
    context.plan = revised
    context.run = await context.service.continue(context.run, revised, additional, signal, context.onProgress)
    return QaPhase.REPORTING
  }

  private buildPrompt(context: QaPhaseContext): string {
    return [
      'Act as an independent human QA evidence analyst.',
      'Inspect the executed plan, results, evidence files, and project. Decide whether important observable risks remain untested.',
      'Consider functional, negative, boundary, security, accessibility, resilience, and state-transition coverage.',
      'Do not change existing criteria or scenarios. Do not change plan id, target, or profile. Add only executable criteria and scenarios justified by observed gaps.',
      'Stay within the configured target. Respect planning action and assertion shapes and budgets.',
      'Return {"complete":true} when coverage is sufficient. Otherwise return {"complete":false,"plan":<complete revised plan object>}.',
      '<qa_plan>', JSON.stringify(context.plan), '</qa_plan>',
      '<qa_run>', JSON.stringify(context.run), '</qa_run>',
    ].join('\n')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
