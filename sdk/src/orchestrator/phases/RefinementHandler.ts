import { loadPrompt } from '../utils/PromptTemplate'
import { join } from 'node:path'
import { writeFileSync, mkdirSync, readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
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

    // Step 1: Generate questions via the CTO
    const questions = await this.generateQuestions(context, scope)

    // Step 2: Collect answers via inquirer prompts
    const qaPairs = await this.collectAnswers(questions)

    // Step 3: Consolidate via the CTO
    await this.consolidateRefinement(context, scope, qaPairs)

    return Phase.BOOTSTRAP
  }

  private async generateQuestions(context: Reviewontext, scope: string): Promise<RefinementQuestion[]> {
    const productDir = getProductDir(context)
    const questionsPath = join(productDir, 'QUESTIONS.json')
    const projectPaths = context.config.projectPaths ?? []
    const pathsToInspect = projectPaths.length > 0 ? projectPaths : [context.workingDir]
    const orientationSection = buildDocsOrientationSection(projectPaths, context.workingDir, undefined, undefined, context.config.agentRunner)

    const staticPrompt = loadPrompt('refinement/questions-static', {})

    const dynamicPrompt = loadPrompt('refinement/questions-dynamic', {
      questionsPath: questionsPath,
      pathsToInspect: pathsToInspect.map((projectPath) => `- ${projectPath}`),
      orientationSection: orientationSection,
      scopeSection: inlineOrReference(
        'scope',
        scope.trim(),
        join(productDir, 'SCOPE.md'),
        'markdown',
        'always',
        context.config.agentRunner,
      ),
    })

    const prompt = `${staticPrompt}\n\n${dynamicPrompt}`

    const output = await context.invokeAgent({
      skill: 'harness-kit:pbb-design',
      agent: 'harness-kit:cto',
      mode: 'autonomous',
      prompt,
      phaseKey: 'refinement_questions',
    })

    const rawQuestions = this.parseQuestions(output?.raw || '')
    const outcome = JsonExtractionProtocol.extract(output?.raw || '')
    if ('data' in outcome && Array.isArray(outcome.data)) {
      this.saveQuestionsFile(context, rawQuestions)
      return rawQuestions
    }
    return this.loadQuestionsFile(context)
  }

  private saveQuestionsFile(context: Reviewontext, questions: RefinementQuestion[]): void {
    const productDir = context.config.productDir ?? join(context.workingDir, 'docs', 'product')
    mkdirSync(productDir, { recursive: true })
    const questionsPath = join(productDir, 'QUESTIONS.json')
    writeFileSync(questionsPath, JSON.stringify(questions, null, 2), 'utf-8')
  }

  private loadQuestionsFile(context: Reviewontext): RefinementQuestion[] {
    const productDir = context.config.productDir ?? join(context.workingDir, 'docs', 'product')
    const questionsPath = join(productDir, 'QUESTIONS.json')

    if (existsSync(questionsPath)) {
      const content = readFileSync(questionsPath, 'utf-8')
      const outcome = JsonExtractionProtocol.extract(content)
      if ('data' in outcome && Array.isArray(outcome.data)) return this.parseQuestions(content)
      throw new Error('Invalid refinement questions file: expected a JSON array')
    }
    throw new Error('Refinement questions were not returned or saved')
  }

  private parseQuestions(raw: string): RefinementQuestion[] {
    const outcome = JsonExtractionProtocol.extract(raw)
    if ('data' in outcome && Array.isArray(outcome.data)) {
      const questions = outcome.data as RefinementQuestion[]
      const questionIds = new Set<number>()
      for (const question of questions) {
        if (!question || !Number.isSafeInteger(question.id) || question.id < 1 || questionIds.has(question.id)) {
          throw new Error('Invalid or duplicate refinement question ID')
        }
        if (typeof question.question !== 'string' || typeof question.recommendation !== 'string' ||
            typeof question.context !== 'string' ||
            (question.category !== undefined && !['business', 'setup'].includes(question.category))) {
          throw new Error(`Invalid refinement question ${question.id}`)
        }
        questionIds.add(question.id)
      }
      if (questions.filter(question => question.category === 'setup').length > 4 ||
          questions.filter(question => question.category !== 'setup').length > 12) {
        throw new Error('Too many refinement questions')
      }
      return questions
    }
    return []
  }

  private async collectAnswers(questions: RefinementQuestion[]): Promise<RefinementEvidence[]> {
    const { input } = await import('@inquirer/prompts')
    const qaPairs: RefinementEvidence[] = []

    console.log('\n── REFINEMENT ──────────────────────────────────────────────')
    console.log(`  Validating ${questions.length} project refinement questions...\n`)

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      console.log(`Question ${i + 1}/${questions.length}: ${q.question}`)
      if (q.context) {
        console.log(`ℹ ${q.context}`)
      }
      console.log(`Recommended: ${q.recommendation}`)

      const answer = await input({
        message: 'Your answer (Enter to accept, /defer or /unknown):',
        default: q.recommendation,
      })

      const command = answer.trim().match(/^\/(defer|unknown)(?:\s+([\s\S]+))?$/i)
      const unresolved = !!command
      qaPairs.push({
        id: q.id,
        question: q.question,
        recommendation: q.recommendation,
        context: q.context,
        ...(q.category ? { category: q.category } : {}),
        answer: unresolved ? 'Unresolved' : (answer.trim() || q.recommendation),
        ...(command?.[2] ? { humanStatement: command[2] } : {}),
        answeredBy: unresolved ? 'unresolved' : 'human',
        status: unresolved ? (command![1].toLowerCase() === 'defer' ? 'Deferred' : 'Unknown') : 'Human validated',
      })
      console.log()
    }

    const additionalAnswer = await input({
      message: 'Any additional information?',
      default: '',
    })

    if (additionalAnswer.trim()) {
      qaPairs.push({
        id: Math.max(0, ...questions.map(question => question.id)) + 1,
        question: 'Any additional information?',
        answer: additionalAnswer.trim(),
        answeredBy: 'human',
        status: 'Human validated',
      })
      console.log()
    }

    console.log('────────────────────────────────────────────────────────────\n')

    return qaPairs
  }

  private async consolidateRefinement(
    context: Reviewontext,
    scope: string,
    qaPairs: RefinementEvidence[]
  ): Promise<void> {
    const productDir = getProductDir(context)
    mkdirSync(productDir, { recursive: true })
    const stagingDir = mkdtempSync(join(productDir, '.refinement-'))
    const refinementPath = join(stagingDir, 'REFINEMENT.md')
    const orientationSection = buildDocsOrientationSection(context.config.projectPaths, context.workingDir, undefined, undefined, context.config.agentRunner)

    const refinementEvidence = JSON.stringify(qaPairs, null, 2)

    const prompt = loadPrompt('refinement/consolidation', {
      refinementPath: refinementPath,
      orientationSection: orientationSection,
      scopeSection: inlineOrReference(
        'scope',
        scope.trim(),
        join(productDir, 'SCOPE.md'),
        'markdown',
        'always',
        context.config.agentRunner,
      ),
      refinementEvidence: refinementEvidence,
    })

    try {
      const output = await context.invokeAgent({
        skill: 'harness-kit:pbb-design',
        agent: 'harness-kit:cto',
        mode: 'autonomous',
        prompt,
        phaseKey: 'refinement_consolidation',
      })
      const candidate = existsSync(refinementPath)
        ? readFileSync(refinementPath, 'utf-8').trim()
        : (output?.raw ?? '').trim()
      const errors = validatePbbContract(candidate, qaPairs)
      if (errors.length > 0) throw new Error(`Invalid refinement: ${errors.join('; ')}`)
      context.fsm.saveRefinement(candidate)
    } finally {
      rmSync(stagingDir, { recursive: true, force: true })
    }
  }
}
