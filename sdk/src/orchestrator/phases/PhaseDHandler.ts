import { Phase } from '../types'
import { AbstractPhaseHandler, PhaseContext } from './AbstractPhaseHandler'

export class PhaseDHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: PhaseContext): Promise<Phase | null> {
    if (phase !== Phase.PHASE_D) {
      return super.handle(phase, context)
    }

    const features = context.fsm.loadBacklog()
    const config = context.fsm.loadBootstrapConfig()
    const maxReworks = config.completionCriteria.maxReworks

    const thresholdTL = config.scoreThresholdTL
    const thresholdAdv = config.scoreThresholdAdv

    const violations: string[] = []

    for (const f of features) {
      if (f.status === 'COMPLETED') {
        if (f.scoreTL !== null && f.scoreTL < thresholdTL) {
          violations.push(`${f.id}: scoreTL ${f.scoreTL} < threshold ${thresholdTL}`)
        }
        if (f.scoreAdv !== null && f.scoreAdv < thresholdAdv) {
          violations.push(`${f.id}: scoreAdv ${f.scoreAdv} < threshold ${thresholdAdv}`)
        }
      }
      if ((f.status === 'BLOCKED' || f.status === 'FAILED') && f.reworks < maxReworks) {
        violations.push(`${f.id}: status ${f.status} but reworks ${f.reworks} < maxReworks ${maxReworks}`)
      }
    }

    const completed = features.filter(f => f.status === 'COMPLETED').length
    const decision = violations.length > 0
      ? `${phase}: completion check — ${completed}/${features.length} completed. Violations: ${violations.join('; ')}`
      : `${phase}: completion check — ${completed}/${features.length} features completed.`

    context.fsm.appendDecision({ featureId: null, decision })

    return Phase.PHASE_E
  }
}
