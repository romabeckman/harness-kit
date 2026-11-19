import { loadPrompt } from '../utils/PromptTemplate'
import { join } from 'node:path'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { Phase } from '../types'
import { AbstractPhaseHandler, Reviewontext } from './AbstractPhaseHandler'
import { JsonExtractionProtocol } from '../../json-extraction/JsonExtractionProtocol'
import { buildDocsOrientationSection, inlineOrReference } from '../utils/PromptHelpers'
import { getProductDir } from '../utils/PhaseFileUtils'

export interface RefinementQuestion {
  id: number
  question: string
  recommendation: string
  context: string
}

interface RefinementAnswer {
  question: string
  answer: string
  recommendation?: string
  context?: string
  answeredBy: 'human'
  status: 'Human validated'
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

    // Step 1: Generate questions via the software architect
    const questions = await this.generateQuestions(context, scope)

    // Step 2: Collect answers via inquirer prompts
    const qaPairs = await this.collectAnswers(questions)

    // Step 3: Consolidate via the software architect
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
      agent: 'harness-kit:software-architect',
      mode: 'autonomous',
      prompt,
      phaseKey: 'refinement_questions',
    })

    const rawQuestions = this.parseQuestions(output?.raw || '')
    if (rawQuestions.length > 0) {
      this.saveQuestionsFile(context, rawQuestions)
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
      try {
        const content = readFileSync(questionsPath, 'utf-8')
        return this.parseQuestions(content)
      } catch {
        // Fallback if parsing file fails
      }
    }
    return []
  }

  private parseQuestions(raw: string): RefinementQuestion[] {
    const outcome = JsonExtractionProtocol.extract(raw)
    if ('data' in outcome && Array.isArray(outcome.data)) {
      return outcome.data as RefinementQuestion[]
    }
    return []
  }

  private async collectAnswers(questions: RefinementQuestion[]): Promise<RefinementAnswer[]> {
    const { input } = await import('@inquirer/prompts')
    const qaPairs: RefinementAnswer[] = []

    if (questions.length === 0) {
      return qaPairs
    }

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
        message: 'Your answer (Enter to accept recommendation):',
        default: q.recommendation,
      })

      qaPairs.push({
        question: q.question,
        recommendation: q.recommendation,
        context: q.context,
        answer: answer.trim() || q.recommendation,
        answeredBy: 'human',
        status: 'Human validated',
      })
      console.log()
    }

    const additionalAnswer = await input({
      message: 'Any additional information?',
      default: '',
    })

    if (additionalAnswer.trim()) {
      qaPairs.push({
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
    qaPairs: RefinementAnswer[]
  ): Promise<void> {
    const productDir = getProductDir(context)
    const refinementPath = join(productDir, 'REFINEMENT.md')
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

    const output = await context.invokeAgent({
      skill: 'harness-kit:pbb-design',
      agent: 'harness-kit:software-architect',
      mode: 'autonomous',
      prompt,
      phaseKey: 'refinement_consolidation',
    })

    if (!context.fsm.existRefinement() && output?.raw?.trim()) {
      context.fsm.saveRefinement(output.raw.trim())
    }
  }
}
