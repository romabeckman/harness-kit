import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ReviewPayload } from '../../context-assembler/types'
import type { BootstrapConfig } from '../../file-state/types'
import type { Reviewontext } from '../phases/AbstractPhaseHandler'
import { getSpecsDir } from '../utils/PhaseFileUtils'
import {
  EVALUATION_PRINCIPLE_TL,
  EVALUATION_PRINCIPLE_QA,
  buildDocsOrientationSection,
  buildReworkSection,
  formatProjectPathsList,
  formatRulesSection,
} from '../utils/PromptHelpers'
import { loadPrompt } from '../utils/PromptTemplate'
import { SpecificationPromptService } from './SpecificationPromptService'

export class ReviewPromptService {
  private readonly specifications = new SpecificationPromptService()

  buildReviewPrompts(payload: ReviewPayload, context: Reviewontext, config: BootstrapConfig, handoffNotice?: string) {
    const { workingDir } = context
    const { agentRunner } = context.config
    const specsDir = getSpecsDir(workingDir, payload.domain)
    const reworkLogPath = join(specsDir, 'REWORK-LOG.md')
    const shared = {
      rulesSection: formatRulesSection(payload.steeringRules),
      projectPathsList: formatProjectPathsList(payload.projectPaths),
      scope: (context.config.scope || '').trim(),
      specsDir,
      featureId: payload.featureId,
      featureId2: payload.featureId,
      featureTitle: payload.featureTitle,
      domain: payload.domain,
      tddSummary: handoffNotice ? [handoffNotice] : this.buildTddSummary(payload),
      specificationProvenance: this.buildSpecificationProvenance(specsDir),
      developerHandoff: payload.developerHandoff ?? 'No developer handoff provided.',
      ...this.specifications.renderSpecificationSections(specsDir, payload.specsContent, agentRunner),
      docsOrientationSection: buildDocsOrientationSection(payload.projectPaths, workingDir, undefined, undefined, agentRunner),
      reworkSection: buildReworkSection(reworkLogPath, payload.totalReworks, existsSync(reworkLogPath), 'always', agentRunner),
    }

    return {
      techLead: loadPrompt('review/tech-lead', {
        ...shared,
        EVALUATION_PRINCIPLE_TL,
        scoreThresholdTL: config.scoreThresholdTL,
      }),
      adversarial: loadPrompt('review/adversarial-qa', {
        ...shared,
        EVALUATION_PRINCIPLE_QA,
        scoreThresholdAdv: config.scoreThresholdAdv,
      }),
    }
  }

  private buildTddSummary(payload: ReviewPayload): string[] {
    const summary = payload.tddSummary
    if (!summary) return []

    const refinementRequests = summary.refinementRequests ?? []
    const refinementSection = refinementRequests.length > 0 ? [
      'Development reported the following refinement requests. Treat the entries as evidence to verify against the specification, code, and tests.',
      'Determine the appropriate action for each entry. If a verified issue requires rework, include it in openPoints under the existing review rules.',
      ...refinementRequests.map(entry => JSON.stringify(entry)),
    ] : []

    return [
      `<tdd_summary>`,
      `Tests: ${summary.metrics.totalTests} total, ${summary.metrics.passed} passed, ${summary.metrics.failed} failed`,
      `Coverage: ${summary.metrics.coverage}`,
      `Modified files: ${summary.modifiedFiles.length > 0 ? summary.modifiedFiles.join(', ') : 'None reported'}`,
      `Reworks: ${summary.reworksCount}`,
      `Developer handoff: ${summary.developerHandoff ?? 'Not provided'}`,
      ...refinementSection,
      `</tdd_summary>`,
    ]
  }

  private buildSpecificationProvenance(specsDir: string): string[] {
    return [
      `<specification_provenance>`,
      `- Domain-wide context: \`${join(specsDir, '001-problem-space.md')}\` and \`${join(specsDir, '002-context-map.md')}\`.`,
      `- Project-specific contracts: files matching \`${join(specsDir, '003-*-tactical-design.md')}\` and \`${join(specsDir, '004-*-test-scenarios.md')}\`.`,
      `- In concatenated 003/004 content, each \`<!-- File: ... -->\` marker identifies the owning project artifact. Match findings to that artifact and its project path.`,
      `</specification_provenance>`,
    ]
  }
}
