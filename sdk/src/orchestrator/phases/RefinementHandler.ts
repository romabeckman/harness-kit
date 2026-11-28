import { RefinementDraftService } from '../services/RefinementDraftService'
import { RefinementQuestionService } from '../services/RefinementQuestionService'
import { Phase } from '../types'
import { AbstractPhaseHandler, type Reviewontext } from './AbstractPhaseHandler'

export type { RefinementQuestion } from '../services/RefinementQuestionService'

export class RefinementHandler extends AbstractPhaseHandler {
  private readonly questions = new RefinementQuestionService()
  private readonly drafts = new RefinementDraftService()

  async handle(phase: Phase, context: Reviewontext): Promise<Phase | null> {
    if (phase !== Phase.REFINEMENT) {
      return super.handle(phase, context)
    }

    if (!context.config.enableRefinement) {
      return Phase.BOOTSTRAP
    }

    if (context.fsm.existRefinement()) {
      return Phase.BOOTSTRAP
    }

    const scope = context.fsm.existScope() ? context.fsm.loadScope() : context.config.scope

    const evidence = await this.questions.collectEvidence(context, scope)
    if (!context.fsm.existRefinement()) {
      context.fsm.saveRefinementEvidence(evidence)
      await this.drafts.publishRefinementDraft(context, scope, evidence)
    }

    return Phase.BOOTSTRAP
  }
}
