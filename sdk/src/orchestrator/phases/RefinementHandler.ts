import { loadPrompt } from '../utils/PromptTemplate'
import { join, resolve } from 'node:path'
import { mkdirSync, readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { stripVTControlCharacters } from 'node:util'
import { Phase } from '../types'
import { AbstractPhaseHandler, Reviewontext } from './AbstractPhaseHandler'
import { JsonExtractionProtocol } from '../../json-extraction/JsonExtractionProtocol'
import { buildDocsOrientationSection, inlineOrReference } from '../utils/PromptHelpers'
import { getProductDir } from '../utils/PhaseFileUtils'
import { validatePbbContract, type RefinementEvidence } from '../utils/PbbContract'

export interface RefinementQuestion {
  id: number
  question: string
  recommendation: string
  context: string
  category?: 'business' | 'setup'
}

export class RefinementHandler extends AbstractPhaseHandler {
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

    const evidence = await this.discover(context, scope)
    if (!context.fsm.existRefinement()) {
      context.fsm.saveRefinementEvidence(evidence)
      await this.consolidateRefinement(context, scope, evidence)
    }

    return Phase.BOOTSTRAP
  }

  private async generateQuestions(
    context: Reviewontext,
    scope: string,
    evidence: RefinementEvidence[] = [],
    pending: RefinementQuestion[] = [],
  ): Promise<RefinementQuestion[]> {
    const productDir = getProductDir(context)
    mkdirSync(productDir, { recursive: true })
    const stagingDir = mkdtempSync(join(productDir, '.refinement-questions-'))
    const questionsPath = join(stagingDir, 'QUESTIONS.json')
    try {
      const projectPaths = context.config.projectPaths ?? []
      const pathsToInspect = projectPaths.length > 0 ? projectPaths : [context.workingDir]
      const orientationSection = buildDocsOrientationSection(projectPaths, context.workingDir, undefined, undefined, context.config.agentRunner)

      const staticPrompt = loadPrompt('refinement/questions-static', {})

      const dynamicPrompt = loadPrompt('refinement/questions-dynamic', {
        questionsPath,
        pathsToInspect: pathsToInspect.map((projectPath) => `- ${projectPath}`),
        orientationSection,
        scopeSection: inlineOrReference(
          'scope',
          scope.trim(),
          join(productDir, 'SCOPE.md'),
          'markdown',
          'always',
          context.config.agentRunner,
        ),
      })

      const followUp = evidence.length > 0 ? loadPrompt('refinement/next-question', {
        evidence: JSON.stringify(evidence, null, 2),
        pending: JSON.stringify(pending, null, 2),
        remainingSetup: 4 - evidence.filter(entry => entry.category === 'setup').length,
        remainingBusiness: 12 - evidence.filter(entry => entry.category !== 'setup').length,
      }) : ''

      await context.invokeAgent({
        skill: 'harness-kit:pbb-design',
        agent: 'harness-kit:cto',
        mode: 'autonomous',
        prompt: `${staticPrompt}\n\n${dynamicPrompt}${followUp ? `\n\n${followUp}` : ''}`,
        phaseKey: 'refinement_questions',
      })
      const questions = existsSync(questionsPath) ? this.parseQuestions(readFileSync(questionsPath, 'utf-8')) : undefined
      if (!questions) throw new Error('Refinement questions must be saved as a JSON array in QUESTIONS.json')
      if (followUp && questions.length > 1) throw new Error('Expected at most one follow-up refinement question')
      const setup = [...evidence, ...questions].filter(entry => entry.category === 'setup').length
      if (setup > 4 || evidence.length + questions.length - setup > 12) {
        throw new Error('Too many refinement questions')
      }
      return questions
    } finally {
      rmSync(stagingDir, { recursive: true, force: true })
    }
  }

  private parseQuestions(contents: string): RefinementQuestion[] | undefined {
    const outcome = JsonExtractionProtocol.extract(contents)
    if (!('data' in outcome) || !Array.isArray(outcome.data)) return undefined
    const questions = outcome.data as RefinementQuestion[]
    const questionIds = new Set<number>()
    for (const question of questions) {
      if (!question || !Number.isSafeInteger(question.id) || question.id < 1 || questionIds.has(question.id)) {
        throw new Error('Invalid or duplicate refinement question ID')
      }
      if (typeof question.question !== 'string' || !question.question.trim() || /[\r\n]/.test(question.question) ||
          typeof question.recommendation !== 'string' || !question.recommendation.trim() || typeof question.context !== 'string' ||
          (question.category !== undefined && !['business', 'setup'].includes(question.category))) {
        throw new Error(`Invalid refinement question ${question.id}`)
      }
      questionIds.add(question.id)
    }
    return questions
  }

  private async discover(context: Reviewontext, scope: string): Promise<RefinementEvidence[]> {
    const evidence: RefinementEvidence[] = []
    const [first, ...initialAgenda] = await this.generateQuestions(context, scope)
    let question = first
    let pending = initialAgenda
    console.log('\n── REFINEMENT ──────────────────────────────────────────────')
    console.log('  Use /edit to open an editor for a multiline answer.\n')
    while (question) {
      console.log(stripVTControlCharacters(`Question ${evidence.length + 1}: ${question.question}`))
      if (question.context) console.log(stripVTControlCharacters(`ℹ  ${question.context}`))
      console.log(stripVTControlCharacters(`Recommended: ${question.recommendation}`))

      const answer = await this.readAnswer('Your answer (Enter to accept, /defer or /unknown):', question.recommendation)
      const command = answer.trimStart().match(/^\/(defer|unknown)(?:\s([\s\S]*))?$/i)
      evidence.push({
        id: question.id,
        question: question.question,
        recommendation: question.recommendation,
        ...(question.context.trim() ? { context: question.context } : {}),
        ...(question.category ? { category: question.category } : {}),
        answer: command ? 'Unresolved' : (answer.trim() ? answer : question.recommendation),
        ...(command?.[2]?.trim() ? { humanStatement: command[2] } : {}),
        answeredBy: command ? 'unresolved' : 'human',
        status: command ? (command[1].toLowerCase() === 'defer' ? 'Deferred' : 'Unknown') : 'Human validated',
      })
      console.log()
      if (evidence.length === 16) break
      pending = pending.filter(candidate => !evidence.some(answered => answered.id === candidate.id))
      const [next] = await this.generateQuestions(context, scope, evidence, pending)
      if (next && evidence.some(answered => answered.id === next.id)) {
        throw new Error(`Refinement follow-up reused answered question ID ${next.id}`)
      }
      question = next
    }

    const additionalQuestion = 'Any additional information?'
    const additionalAnswer = await this.readAnswer(additionalQuestion)
    if (additionalAnswer.trim()) this.recordComment(evidence, additionalQuestion, additionalAnswer)
    return evidence
  }

  private async readAnswer(message: string, defaultAnswer = ''): Promise<string> {
    const { input, editor } = await import('@inquirer/prompts')
    const answer = await input({ message: ` ${message}`, default: defaultAnswer })
    return answer.trim() === '/edit'
      ? editor({ message: ' Write your answer, then save and close the editor:' })
      : answer
  }

  private recordComment(evidence: RefinementEvidence[], question: string, answer: string): void {
    const usedIds = new Set(evidence.map(entry => entry.id))
    let id = 1
    while (usedIds.has(id)) id++
    evidence.push({ id, question, answer, answeredBy: 'human', status: 'Human validated' })
  }

  private async consolidateRefinement(
    context: Reviewontext,
    scope: string,
    evidence: RefinementEvidence[],
  ): Promise<void> {
    const productDir = resolve(getProductDir(context))
    const orientationSection = buildDocsOrientationSection(context.config.projectPaths, context.workingDir, undefined, undefined, context.config.agentRunner)
    const businessEvidence = JSON.stringify(evidence.filter(entry => entry.category !== 'setup'), null, 2)
    const prompt = loadPrompt('refinement/consolidation', {
      orientationSection,
      refinementPath: join(productDir, 'REFINEMENT.md'),
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
    try {
      await context.invokeAgent({
        skill: 'harness-kit:pbb-design',
        agent: 'harness-kit:cto',
        mode: 'autonomous',
        prompt,
        phaseKey: 'refinement_consolidation',
      })
    } finally {
      if (!context.fsm.existRefinement()) {
        context.fsm.saveRefinement(`# Refinement\n\n## Scope\n\n${scope.trim()}\n\n## Business answers\n\n\`\`\`json\n${businessEvidence}\n\`\`\`\n`)
      }
    }
  }
}
