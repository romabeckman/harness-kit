import { AgentRunnerError, AgentRunnerErrorCode } from '../../agent-runner/AgentRunnerError'
import type { AgentOutput } from '../../agent-runner/types'
import type { BootstrapConfig } from '../../file-state/types'
import { AnsiHelpers } from '../../ui/AnsiHelpers'
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
      this.failReview()
      return null
    }
    if (techLead.status === 'rejected') throw techLead.reason
    if (adversarial.status === 'rejected') throw adversarial.reason
    return [techLead.value, adversarial.value]
  }

  preservePolicyBlock(): boolean {
    if (!this.config.reviewPolicyBlockedFeatures?.includes(this.featureId)) return false
    this.failReview()
    return true
  }

  clearPolicyBlock(): void {
    const blockedFeatures = this.config.reviewPolicyBlockedFeatures
    if (!blockedFeatures?.includes(this.featureId)) return
    this.config.reviewPolicyBlockedFeatures = blockedFeatures.filter(id => id !== this.featureId)
    this.context.fsm.saveBootstrapConfig(this.config)
  }

  private failReview(): void {
    const { fsm } = this.context
    const blockedFeatures = new Set(this.config.reviewPolicyBlockedFeatures)
    blockedFeatures.add(this.featureId)
    this.config.reviewPolicyBlockedFeatures = [...blockedFeatures]
    fsm.saveBootstrapConfig(this.config)

    const heading = `X [phase_review] ${this.featureId} marked FAILED`
    const reason = 'The provider declined the automated review under its cybersecurity safeguards (SAFETY_POLICY_BLOCKED).'
    const displayHeading = process.stderr.isTTY ? AnsiHelpers.red(heading) : heading
    process.stderr.write(
      `\n${displayHeading}\n  ${reason}\n` +
      '  Manual review required. The workflow continues with the next pending feature, if any.\n\n'
    )
    fsm.appendDecision({
      featureId: this.featureId,
      decision: `Review for ${this.featureId} marked FAILED. ${reason} Manual review required.`,
    })
    fsm.updateFeatureStatus(this.featureId, 'FAILED')
    fsm.updateAllFeatureTasks(this.featureId, '-', 'FAILED')
    clearFeatureDeveloperSessions(this.context)
  }
}
