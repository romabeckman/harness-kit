import { AgentRunnerError, AgentRunnerErrorCode } from '../../agent-runner/AgentRunnerError'
import type { AgentOutput } from '../../agent-runner/types'
import type { BootstrapConfig } from '../../file-state/types'
import type { Reviewontext } from '../phases/AbstractPhaseHandler'
import { clearFeatureDeveloperSessions } from '../utils/SessionHelpers'

type ReviewOutcome = PromiseSettledResult<AgentOutput>

export class ReviewFailureService {
  constructor(
    private readonly context: Reviewontext,
    private readonly config: BootstrapConfig,
    private readonly featureId: string,
  ) {}

  resolveOutputs([techLead, adversarial]: readonly [ReviewOutcome, ReviewOutcome]): [AgentOutput, AgentOutput] | null {
    if ([techLead, adversarial].some(review => review.status === 'rejected'
      && review.reason instanceof AgentRunnerError
      && review.reason.code === AgentRunnerErrorCode.SAFETY_POLICY_BLOCKED)) {
      this.blockReview()
      return null
    }
    if (techLead.status === 'rejected') throw techLead.reason
    if (adversarial.status === 'rejected') throw adversarial.reason
    return [techLead.value, adversarial.value]
  }

  preservePolicyBlock(): boolean {
    if (!this.config.reviewPolicyBlockedFeatures?.includes(this.featureId)) return false
    this.blockReview()
    return true
  }

  clearPolicyBlock(): void {
    const blockedFeatures = this.config.reviewPolicyBlockedFeatures
    if (!blockedFeatures?.includes(this.featureId)) return
    this.config.reviewPolicyBlockedFeatures = blockedFeatures.filter(id => id !== this.featureId)
    this.context.fsm.saveBootstrapConfig(this.config)
  }

  private blockReview(): void {
    const { fsm } = this.context
    const blockedFeatures = new Set(this.config.reviewPolicyBlockedFeatures)
    blockedFeatures.add(this.featureId)
    this.config.reviewPolicyBlockedFeatures = [...blockedFeatures]
    fsm.saveBootstrapConfig(this.config)

    const message = `Review for ${this.featureId} was blocked by the provider's cybersecurity safeguards. Manual review required. Continuing the workflow.`
    process.stderr.write(`[phase_review] ${message}\n`)
    fsm.appendDecision({ featureId: this.featureId, decision: message })
    fsm.updateFeatureStatus(this.featureId, 'BLOCKED')
    fsm.updateAllFeatureTasks(this.featureId, '-', 'BLOCKED')
    clearFeatureDeveloperSessions(this.context)
  }
}
