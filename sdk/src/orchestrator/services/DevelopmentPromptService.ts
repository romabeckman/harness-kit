import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { DevelopmenPayload } from '../../context-assembler/types'
import type { Reviewontext } from '../phases/AbstractPhaseHandler'
import { getPlanningSource, getSpecsDir } from '../utils/PhaseFileUtils'
import {
  buildDocsOrientationSection,
  formatRulesSection,
  formatProjectPathsList,
  formatTasksList,
  inlineOrReference,
} from '../utils/PromptHelpers'
import { loadPrompt } from '../utils/PromptTemplate'
import { SpecificationPromptService } from './SpecificationPromptService'

export class DevelopmentPromptService {
  private readonly specifications = new SpecificationPromptService()

  buildDevelopmentPrompt(payload: DevelopmenPayload, context: Reviewontext): string {
    return this.buildStandalonePrompt('development/initial', payload, context)
  }

  buildStandaloneReworkPrompt(payload: DevelopmenPayload, context: Reviewontext): string {
    return this.buildStandalonePrompt('development/rework', payload, context)
  }

  private buildStandalonePrompt(
    template: 'development/initial' | 'development/rework',
    payload: DevelopmenPayload,
    context: Reviewontext,
  ): string {
    const { workingDir } = context
    const { agentRunner } = context.config

    return loadPrompt(template, {
      redGuidance: loadPrompt('development/red-guidance', {}),
      rulesSection: formatRulesSection(payload.steeringRules),
      projectPathsList: formatProjectPathsList(payload.projectPaths),
      workingDir: getSpecsDir(workingDir, payload.domain),
      featureId: payload.featureId,
      reworks: payload.reworks,
      specsSection: this.buildSpecsSection(payload, workingDir, agentRunner),
      orientationSection: buildDocsOrientationSection(payload.projectPaths, workingDir, undefined, undefined, agentRunner),
      featureId2: payload.featureId,
      featureTitle: payload.featureTitle,
      domain: payload.domain,
      tasksSection: this.buildTasksSection(payload.tasks),
      ...(template === 'development/rework' ? { reworkSection: this.buildReworkSection(payload, context) } : {}),
    })
  }

  buildContinuationReworkPrompt(payload: DevelopmenPayload, context: Reviewontext): string {
    const workingDir = getSpecsDir(context.workingDir, payload.domain)
    const planningSource = getPlanningSource(context)

    return loadPrompt('development/continuation', {
      redGuidance: loadPrompt('development/red-guidance', {}),
      featureId: payload.featureId,
      featureTitle: payload.featureTitle,
      label: planningSource.label,
      path: planningSource.path,
      workingDir,
      projectPathsList: formatProjectPathsList(payload.projectPaths),
      reworkSection: this.buildReworkSection(payload, context),
      tasksSection: this.buildTasksSection(payload.tasks),
      workingDir2: workingDir,
      featureId2: payload.featureId,
      reworks: payload.reworks,
    })
  }

  private buildTasksSection(tasks: DevelopmenPayload['tasks']): string {
    return ['<tasks>', formatTasksList(tasks), '</tasks>', ''].join('\n')
  }

  private buildReworkSection(payload: DevelopmenPayload, context: Reviewontext): string {
    const workingDir = join(context.workingDir, 'docs', 'specs', payload.domain)
    const reworkLogPath = payload.reworkLogPath
      ? resolve(context.workingDir, payload.reworkLogPath)
      : join(workingDir, 'REWORK-LOG.md')
    const reworkLogContent = existsSync(reworkLogPath) ? readFileSync(reworkLogPath, 'utf8') : ''
    return loadPrompt('development/rework-section', {
      reworkLogPath: reworkLogPath,
      reworkLogContentSection: inlineOrReference('rework_log_content', reworkLogContent, reworkLogPath, 'markdown', 'always', context.config.agentRunner),
      reworkLogPath2: reworkLogPath,
    }) + '\n'
  }

  private buildSpecsSection(payload: DevelopmenPayload, workingDir: string, activeRunner?: Reviewontext['config']['agentRunner']): string[] {
    const specsDir = join(workingDir, 'docs', 'specs', payload.domain)
    const specs = payload.specsContent
    if (!specs) return []

    const sections: string[] = [
      `<specification_provenance>`,
      `- 001/002 are domain-wide context shared by all projects in this feature.`,
      `- Each 003/004 file is project-specific; \`<!-- File: ... -->\` markers identify ownership when content is concatenated.`,
      `- Match each task's [project] tag to its project path and owning 003/004 artifacts.`,
      `</specification_provenance>`,
    ]

    const sectionsByArtifact = this.specifications.renderSpecificationSections(specsDir, specs, activeRunner)
    if (!payload.isRetry) {
      sections.push(...sectionsByArtifact.problemSpaceSection, ...sectionsByArtifact.contextMapSection)
    }

    sections.push(...sectionsByArtifact.tacticalDesignSection, ...sectionsByArtifact.testScenariosSection)
    return sections
  }
}
