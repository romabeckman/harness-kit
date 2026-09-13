import { QaPlanValidator } from '../services/QaPlanValidator'
import { QaPhase, type QaPhaseContext, type QaPhaseHandler } from './types'

export class QaValidationPhase implements QaPhaseHandler {
  readonly phase = QaPhase.VALIDATION

  async execute(context: QaPhaseContext, signal?: AbortSignal): Promise<QaPhase> {
    if (!context.plan) throw new Error('Agentic QA validation requires a plan')
    const validation = await new QaPlanValidator(context.service).validate(context.plan, context.workspace, signal)
    if (!validation.valid) {
      context.onProgress?.({ type: 'validation_failed', phase: QaPhase.VALIDATION, errors: validation.errors })
      throw new Error(['QA plan validation failed:', ...validation.errors.map((error) => `- ${error}`)].join('\n'))
    }
    if (context.persistPlan) {
      context.store.savePlan(context.plan)
      if (context.request.scope !== undefined) context.store.saveScope(context.plan.id, context.request.scope)
      context.persistPlan = false
    }
    return QaPhase.EXECUTION
  }
}
