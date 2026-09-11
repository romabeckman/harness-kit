import { QaPhase, type QaPhaseContext, type QaPhaseHandler } from './types'

export class QaExecutionPhase implements QaPhaseHandler {
  readonly phase = QaPhase.EXECUTION

  async execute(context: QaPhaseContext, signal?: AbortSignal): Promise<QaPhase> {
    if (!context.plan) throw new Error('Agentic QA execution requires a plan')
    context.run = await context.service.execute(context.plan, signal, context.onProgress)
    return QaPhase.REPORTING
  }
}
