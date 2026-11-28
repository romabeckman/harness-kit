import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Reviewontext } from '../phases/AbstractPhaseHandler'
import { validatePbbContract, type RefinementEvidence } from '../utils/PbbContract'
import { getProductDir } from '../utils/PhaseFileUtils'
import { buildDocsOrientationSection, inlineOrReference } from '../utils/PromptHelpers'
import { loadPrompt } from '../utils/PromptTemplate'

export class RefinementDraftService {
  async publishRefinementDraft(
    context: Reviewontext,
    scope: string,
    evidence: RefinementEvidence[],
  ): Promise<void> {
    const productDir = resolve(getProductDir(context))
    const orientationSection = buildDocsOrientationSection(context.config.projectPaths, context.workingDir, undefined, undefined, context.config.agentRunner)
    const businessEvidence = JSON.stringify(evidence.filter(entry => entry.category !== 'setup'), null, 2)
    const stagingDir = mkdtempSync(join(productDir, '.refinement-draft-'))
    const refinementPath = join(stagingDir, 'REFINEMENT.md')
    let publication = `# Refinement\n\n## Scope\n\n${scope.trim()}\n\n## Business answers\n\n\`\`\`json\n${businessEvidence}\n\`\`\`\n`
    const invocation = {
      skill: 'harness-kit:pbb-design',
      agent: 'harness-kit:cto',
      mode: 'autonomous',
      phaseKey: 'refinement_consolidation',
    } as const

    try {
      const prompt = loadPrompt('refinement/consolidation', {
        orientationSection,
        refinementPath,
        scopeSection: inlineOrReference(
          'scope',
          scope.trim(),
          join(productDir, 'SCOPE.md'),
          'markdown',
          'always',
          context.config.agentRunner,
        ),
        refinementEvidence: businessEvidence,
        setupIds: JSON.stringify(evidence.filter(entry => entry.category === 'setup').map(entry => entry.id)),
      })
      const consolidation = await context.invokeAgent({ ...invocation, prompt })
      const draft = this.readDraft(refinementPath, evidence)
      if (!draft) return
      if (draft.issues.length === 0) {
        publication = draft.content
        return
      }

      const correction = loadPrompt('refinement/correction', {
        issues: draft.issues.map(issue => `- ${issue}`),
      })

      try {
        const session = consolidation?.session
        await context.invokeAgent({
          ...invocation,
          prompt: `${prompt}\n\n${correction}`,
          ...(session ? { session } : {}),
        })
        const corrected = this.readDraft(refinementPath, evidence)
        if (corrected && corrected.issues.length === 0) {
          publication = corrected.content
          return
        }
      } catch {
        // The scope and recorded answers remain available when correction fails.
      }
      console.warn('[REFINEMENT] Continuing with the original scope and recorded business answers after draft correction failed.')
    } finally {
      try {
        if (!context.fsm.existRefinement()) context.fsm.saveRefinement(publication)
      } finally {
        rmSync(stagingDir, { recursive: true, force: true })
      }
    }
  }

  private readDraft(path: string, evidence: RefinementEvidence[]): { content: string; issues: string[] } | undefined {
    if (!existsSync(path)) return undefined
    try {
      const content = readFileSync(path, 'utf8')
      return { content, issues: validatePbbContract(content, evidence) }
    } catch {
      return { content: '', issues: ['Check the full draft against the PBB contract and recorded evidence.'] }
    }
  }
}
