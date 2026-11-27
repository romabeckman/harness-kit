import { join } from 'node:path'
import { ContextAssembler } from '../../context-assembler/ContextAssembler'
import { buildDreamingPrompt, dreamingFingerprint, validateDreamingReceipt } from '../../file-state/DreamingAnalysis'
import type { DreamingEpisode } from '../../file-state/DreamingEpisodeStore'
import type { BootstrapConfig, Feature, FeatureStatus } from '../../file-state/types'
import type { ReviewPayload } from '../../context-assembler/types'
import { ValidationGate } from '../../validation-gate/ValidationGate'
import { Verdict, type ValidationScores } from '../../validation-gate/types'
import { PhaseDecisionLogger } from '../services/PhaseDecisionLogger'
import { ReviewFailureService } from '../services/ReviewFailureService'
import { ReviewPromptService } from '../services/ReviewPromptService'
import { ReviewReportService } from '../services/ReviewReportService'
import { TddOutputService } from '../services/TddOutputService'
import { Phase } from '../types'
import { getPlanningSource, getProductDir } from '../utils/PhaseFileUtils'
import { clearFeatureDeveloperSessions } from '../utils/SessionHelpers'
import { AbstractPhaseHandler, type Reviewontext } from './AbstractPhaseHandler'

type ValidationResult = ReturnType<typeof ValidationGate.evaluate>

export class ReviewHandler extends AbstractPhaseHandler {
  private readonly prompts = new ReviewPromptService()
  private readonly reports = new ReviewReportService()

  async handle(phase: Phase, context: Reviewontext): Promise<Phase | null> {
    if (phase !== Phase.REVIEW) {
      return super.handle(phase, context)
    }

    const features = context.fsm.loadBacklog()
    const activeFeature = context.getActiveFeature(features)
    if (!activeFeature) {
      throw new Error(`Illegal state: phase ${phase} requires an active feature but none is set`)
    }

    const config = context.fsm.loadBootstrapConfig()
    const reviewFailures = new ReviewFailureService(context, config, activeFeature.id)

    const tddOutput = new TddOutputService(context.workingDir, activeFeature)
    const payload = ContextAssembler.buildReviewPayload(
      activeFeature,
      context.workingDir,
      context.config.projectPaths,
      config.steeringRules
    )
    const handoffNotice = payload.tddSummary ? undefined : tddOutput.unavailableNotice()
    if (handoffNotice) {
      context.fsm.appendDecision({ featureId: activeFeature.id, decision: 'Review: development handoff unavailable', rationale: handoffNotice })
    }

    if (context.config.skipValidation) {
      if (reviewFailures.preservePolicyBlock()) {
        this.recordReview(context, activeFeature, tddOutput, 'INTERRUPTED')
        tddOutput.clear(context)
        return Phase.TRANSITION
      }
      process.stdout.write(`[phase_review] --skip-validation active — skipping review for feature ${activeFeature.id}\n`)
      this.recordReview(context, activeFeature, tddOutput, 'SKIPPED')
      clearFeatureDeveloperSessions(context)
      context.fsm.updateFeatureStatus(activeFeature.id, 'COMPLETED')
      context.fsm.updateAllFeatureTasks(activeFeature.id, '-', 'COMPLETED')
      context.fsm.appendDecision({
        featureId: activeFeature.id,
        decision: `REVIEW skipped by execution policy for feature ${activeFeature.id}.`,
      })
      tddOutput.clear(context)
      return Phase.TRANSITION
    }

    const planningSource = getPlanningSource(context)
    if (planningSource.exists) {
      context.config.scope = planningSource.content
    }

    this.reports.cleanReviewReports(context.workingDir, activeFeature.domain)

    const results = await this.executeAgents(context, payload, config, handoffNotice)
    this.reports.saveDebugCopies(context.workingDir, activeFeature.domain)
    let outputs: ReturnType<ReviewFailureService['resolveOutputs']>
    try {
      outputs = reviewFailures.resolveOutputs(results)
    } catch (error) {
      this.recordReview(context, activeFeature, tddOutput, 'INTERRUPTED')
      throw error
    }
    if (!outputs) {
      this.recordReview(context, activeFeature, tddOutput, 'INTERRUPTED')
      tddOutput.clear(context)
      return Phase.TRANSITION
    }

    const [techLead, adversarial] = outputs
    const { scores, evidence, hasReviewerResults } = this.reports.readReviewReports(context.workingDir, activeFeature.domain, techLead, adversarial)

    const result = ValidationGate.evaluate(
      scores,
      activeFeature.reworks,
      config
    )

    const sessions = [techLead.session?.id, adversarial.session?.id].filter((id): id is string => !!id)
    const episode = this.recordReview(context, activeFeature, tddOutput, hasReviewerResults ? result.verdict : 'INTERRUPTED', sessions, hasReviewerResults ? evidence : [])
    const nextPhase = this.processDecision(context, activeFeature, tddOutput, result, scores)
    if (result.verdict === 'PASS') reviewFailures.clearPolicyBlock()
    if (episode?.review === 'PASS') await this.reviewLearningTriggers(context, episode)
    return nextPhase
  }

  private recordReview(
    context: Reviewontext, feature: Feature, tddOutput: TddOutputService, verdict: NonNullable<DreamingEpisode['review']>,
    sessions?: string[], evidence?: unknown[],
  ): DreamingEpisode | undefined {
    if (!context.dreaming) return
    const output = tddOutput.readForAttempt()
    if (output) return context.dreaming.recordReview(feature, output, verdict, sessions, evidence)
  }

  private async reviewLearningTriggers(context: Reviewontext, episode: DreamingEpisode): Promise<void> {
    for (const project of episode.projects) {
      const chain = context.dreaming!.learningChain(episode, project.root)
      const fingerprint = dreamingFingerprint(chain.attempts)
      let raw = ''
      try {
        if (chain.error) raw = JSON.stringify({ episode_id: episode.id, status: 'incomplete', reason: chain.error })
        else {
          const result = await context.invokeAgent({
            agent: 'harness-kit:software-architect', skill: 'harness-kit:project-dreaming', mode: 'autonomous',
            domain: episode.domain, workspacePath: project.root,
            prompt: buildDreamingPrompt({ project: project.root, feature: episode.domain, episode_id: episode.id,
              attempts: chain.attempts, handoff_directory: join(getProductDir(context), 'project-dreaming', 'handoffs') }, false),
          })
          raw = result.success === false ? JSON.stringify({ episode_id: episode.id, status: 'incomplete', reason: result.raw || 'Dreaming runner failed.' }) : result.raw
        }
      } catch (error) {
        console.warn('[project-dreaming] Post-acceptance review failed:', error)
        raw = JSON.stringify({ episode_id: episode.id, status: 'incomplete', reason: error instanceof Error ? error.message : String(error) })
      }
      const receipt = validateDreamingReceipt(raw, project.root, episode.id, chain.attempts.map(attempt => attempt.id))
      context.dreaming!.recordAnalysis(episode.id, project.root, fingerprint, receipt)
      if (receipt.status === 'incomplete') context.fsm.appendDecision({ featureId: episode.featureId, decision: `Retry Project Dreaming for episode ${episode.id} in ${project.root}: ${receipt.reason}` })
    }
  }

  private async executeAgents(context: Reviewontext, payload: ReviewPayload, config: BootstrapConfig, handoffNotice?: string) {
    const prompts = this.prompts.buildReviewPrompts(payload, context, config, handoffNotice)

    const tlAgent = 'harness-kit:harness-tech-lead'
    const advAgent = 'harness-kit:harness-qa'

    const tlSession = context.getDeveloperSession?.(tlAgent, payload.featureId, Phase.REVIEW)
    const advSession = context.getDeveloperSession?.(advAgent, payload.featureId, Phase.REVIEW)

    const tlPromise = context.invokeAgent({
      skill: 'harness-kit:the-grumpy-tech-lead',
      agent: tlAgent,
      mode: 'autonomous',
      prompt: prompts.techLead,
      payload: { featureId: payload.featureId, domain: payload.domain },
      phaseKey: 'review_tl',
      domain: payload.domain,
      ...(tlSession ? { session: tlSession } : {}),
    }).then(output => {
      if (output.session) {
        context.setDeveloperSession?.({
          featureId: payload.featureId,
          agent: tlAgent,
          session: output.session,
          phase: Phase.REVIEW,
        })
      }
      return output
    })

    const advPromise = context.invokeAgent({
      skill: 'harness-kit:adversarial-qa',
      agent: advAgent,
      mode: 'autonomous',
      prompt: prompts.adversarial,
      payload: { featureId: payload.featureId, domain: payload.domain },
      phaseKey: 'review_adv',
      domain: payload.domain,
      ...(advSession ? { session: advSession } : {}),
    }).then(output => {
      if (output.session) {
        context.setDeveloperSession?.({
          featureId: payload.featureId,
          agent: advAgent,
          session: output.session,
          phase: Phase.REVIEW,
        })
      }
      return output
    })

    return Promise.allSettled([tlPromise, advPromise] as const)
  }

  /**
   * Processes the validation gate evaluation result and decides the next workflow step.
   * Logs decisions, manages feature state transitions, and moves to TRANSITION or retries.
   */
  private processDecision(
    context: Reviewontext,
    activeFeature: Feature,
    tddOutput: TddOutputService,
    result: ValidationResult,
    scores: ValidationScores
  ): Phase {
    // Append verification decision log with scores and rationale
    PhaseDecisionLogger.logReview(
      context.fsm,
      activeFeature,
      result.verdict,
      scores.scoreTL,
      scores.scoreAdv,
      result.reason
    )

    if (result.verdict === Verdict.RETRY) {
      context.fsm.incrementReworks(activeFeature.id)
      context.fsm.writeReworkLog(activeFeature.domain, this.reports.buildReworkContent(scores))
      context.fsm.updateAllFeatureTasks(activeFeature.id, '-', 'NOT_STARTED')
      tddOutput.clear(context)
      return Phase.DEVELOPMENT
    }

    // Map validation gate verdicts to corresponding bootstrap statuses
    const statusMap: Record<string, FeatureStatus> = {
      'PASS': 'COMPLETED',
      'BLOCK': 'BLOCKED',
      'FAIL': 'FAILED'
    }

    activeFeature.status = statusMap[result.verdict] || activeFeature.status
    context.fsm.updateAllFeatureTasks(activeFeature.id, '-', activeFeature.status)
    context.fsm.updateFeatureStatus(activeFeature.id, activeFeature.status, { tl: scores.scoreTL, adv: scores.scoreAdv })
    tddOutput.clear(context)

    // Clear developer session upon exiting the dev/review cycle for this feature
    clearFeatureDeveloperSessions(context)

    // Proceed to TRANSITION
    return Phase.TRANSITION
  }
}
