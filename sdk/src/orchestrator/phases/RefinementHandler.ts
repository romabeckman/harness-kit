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
    const orientationSection = buildDocsOrientationSection(context.config.projectPaths, context.workingDir, undefined, undefined, context.config.agentRunner)

    const staticPrompt = [
      `<skill_context>`,
      `Invoke the \`harness-kit:pbb-design\` skill before starting.`,
      `Mode: autonomous question discovery; the handler collects human answers.`,
      `For this pass, follow the JSON question contract below instead of producing`,
      `the final PBB document.`,
      `</skill_context>`,
      ``,
      `<objective>`,
      `Use Product Backlog Building (PBB) to analyze the scope in <dynamic_context>.`,
      `Generate only decision-relevant questions needed to produce a traceable Product`,
      `Backlog from problems, expectations, personas, functionalities, and PBIs.`,
      `</objective>`,
      ``,
      `<rules>`,
      `- Ask 0-12 questions. Do not fabricate gaps to reach a quota.`,
      `- Focus on missing business outcomes, boundaries, personas, permissions, workflows,`,
      `  pricing, integrations, and regulatory needs that change the Product Backlog.`,
      `- Do not ask architecture, implementation, framework, or code questions.`,
      `- Recommendations must be conservative, scope-preserving, and grounded in evidence.`,
      `- Treat every recommendation as provisional until the human accepts or replaces it.`,
      `</rules>`,
      ``,
      `<question_requirements>`,
      `For each question, provide:`,
      `- "question": a clear, specific business question`,
      `- "recommendation": the safest scope-preserving suggested answer`,
      `- "context": why the answer changes PBB traceability or backlog scope`,
      `</question_requirements>`,
      ``,
      `<output_format>`,
      `Return ONLY one raw JSON array, with no Markdown fences or prose, matching this schema:`,
      `[`,
      `  { "id": 1, "question": "...", "recommendation": "...", "context": "..." }`,
      `]`,
      `</output_format>`,
    ].join('\n')

    const dynamicPrompt = [
      `<dynamic_context>`,
      `<output_path>${questionsPath}</output_path>`,
      ...orientationSection,
      ...inlineOrReference(
        'scope',
        scope.trim(),
        join(productDir, 'SCOPE.md'),
        'markdown',
        'always',
        context.config.agentRunner,
      ),
      `</dynamic_context>`,
      ``,
      `Write the final JSON array to the file at <output_path> above.`,
    ].join('\n')

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

    const prompt = [
      `<skill_context>`,
      `Invoke the \`harness-kit:pbb-design\` skill before starting.`,
      `Mode: autonomous consolidation using human-validated refinement evidence.`,
      `Produce the final PBB document at <output_file>.`,
      `</skill_context>`,
      ``,
      `<objective>`,
      `Use Product Backlog Building (PBB) to transform the scope and refinement evidence`,
      `into business context for Bootstrap backlog generation and Planning.`,
      `</objective>`,
      ``,
      `<output_file>`,
      refinementPath,
      `</output_file>`,
      ``,
      ...orientationSection,
      `<output_format>`,
      `Write the file with exactly this structure (Markdown):`,
      ``,
      `# Product Backlog Building — Project Context`,
      ``,
      `## 1. Product`,
      `## 2. Problems`,
      `## 3. Expectations`,
      `## 4. Personas`,
      `## 5. Functionalities`,
      `## 6. Product Backlog`,
      `## 7. Traceability`,
      `## 8. Assumptions`,
      `## 9. Open Questions`,
      ``,
      `## Frontend Screens & Visualization`,
      `</output_format>`,
      ``,
      `<rules>`,
      `- Invoke and follow the loaded pbb-design skill.`,
      `- Base every item strictly on scope and <refinement_evidence>.`,
      `- Human answers are authoritative. Recommendations remain supporting rationale.`,
      `- Trace every PBI to a functionality, persona, and problem or expectation.`,
      `- In Open Questions preserve question, suggested answer, rationale, resolved answer,`,
      `  answered-by value, and status from the evidence.`,
      `- Mark any model-derived statement as a Provisional model assumption.`,
      `- Do not include architecture or implementation details.`,
      `- If no decision-relevant gap remains, write "No open questions."`,
      `- Treat Frontend Screens & Visualization as a complement to PBB, never as a replacement`,
      `  for problems, expectations, personas, functionalities, PBIs, or traceability.`,
      `</rules>`,
      ``,
      `<optional_ui_prototype_analysis>`,
      `UI prototype analysis is optional. If a prototype, screen, frame, image, or link is available,`,
      `optionally invoke the \`harness-kit:read-ui-prototype\` skill and place its structural`,
      `screen description under \`## Frontend Screens & Visualization\`.`,
      `If no prototype, screen, frame, image, or link is available, skip the skill. Derive only`,
      `screen-level interactions supported by the scope, PBIs, and answers. If none exist, write`,
      `"None identified." Do not request a prototype or invent visual values or implementation details.`,
      `</optional_ui_prototype_analysis>`,
      ``,
      ...inlineOrReference(
        'scope',
        scope.trim(),
        join(productDir, 'SCOPE.md'),
        'markdown',
        'always',
        context.config.agentRunner,
      ),
      ``,
      `<refinement_evidence>`,
      refinementEvidence,
      `</refinement_evidence>`,
    ].join('\n')

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
