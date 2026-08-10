import { join } from 'node:path'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { Phase } from '../types'
import { AbstractPhaseHandler, Reviewontext } from './AbstractPhaseHandler'
import { JsonExtractionProtocol } from '../../json-extraction/JsonExtractionProtocol'

export interface RefinementQuestion {
  id: number
  question: string
  recommendation: string
  context: string
}

export class RefinementHandler extends AbstractPhaseHandler {
  async handle(phase: Phase, context: Reviewontext): Promise<Phase | null> {
    if (phase !== Phase.REFINEMENT) {
      return super.handle(phase, context)
    }

    if (!context.config.enableRefinement) {
      return Phase.PLANNING
    }

    if (context.fsm.existRefinement()) {
      return Phase.PLANNING
    }

    const scope = context.fsm.existScope() ? context.fsm.loadScope() : context.config.scope

    // Step 1: Generate questions via the software architect
    const questions = await this.generateQuestions(context, scope)

    // Step 2: Collect answers via inquirer prompts
    const qaPairs = await this.collectAnswers(questions)

    // Step 3: Consolidate via the software architect
    await this.consolidateRefinement(context, scope, qaPairs)

    return Phase.PLANNING
  }

  private async generateQuestions(context: Reviewontext, scope: string): Promise<RefinementQuestion[]> {
    const productDir = context.config.productDir ?? join(context.workingDir, 'docs', 'product')
    const questionsPath = join(productDir, 'QUESTIONS.json')

    const staticPrompt = [
      `<role>`,
      `You are a software architect who surfaces systemic risks through Socratic questioning`,
      `rather than prescribing solutions outright.`,
      `</role>`,
      ``,
      `<objective>`,
      `Analyze the project scope provided in <dynamic_context> and generate 5-8 Socratic`,
      `questions that surface architectural decisions, technical risks, edge cases,`,
      `constraints, and quality requirements that are implicit or missing from the scope.`,
      `</objective>`,
      ``,
      `<rules>`,
      `- Focus on decisions that will impact the development plan, not syntax or style.`,
      `- Prioritize in this order: architecture > security > performance > maintainability.`,
      `- Recommendations must be opinionated and justified — not generic advice.`,
      `- Questions must be answerable by a developer who knows the project (avoid`,
      `  questions requiring info the scope doesn't imply).`,
      `- Mentally simulate the scope under production stress (scale, failures, concurrency)`,
      `  before writing each question.`,
      `</rules>`,
      ``,
      `<question_requirements>`,
      `For each question, provide:`,
      `- "question": a clear, specific, Socratic question (not a directive)`,
      `- "recommendation": a recommended answer based on your analysis of the scope`,
      `- "context": brief explanation of why this question matters (cite systemic impact)`,
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
      `<scope>`,
      '```markdown',
      scope.trim(),
      '```',
      `</scope>`,
      `</dynamic_context>`,
      ``,
      `Write the final JSON array to the file at <output_path> above.`,
    ].join('\n')

    const prompt = `${staticPrompt}\n\n${dynamicPrompt}`

    const output = await context.invokeAgent({
      agent: 'harness-kit:software-architect',
      mode: 'autonomous',
      prompt,
      phaseKey: 'planning',
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

  private async collectAnswers(questions: RefinementQuestion[]): Promise<Array<{ question: string; answer: string }>> {
    const { input } = await import('@inquirer/prompts')
    const qaPairs: Array<{ question: string; answer: string }> = []

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
        answer: answer.trim() || q.recommendation,
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
      })
      console.log()
    }

    console.log('────────────────────────────────────────────────────────────\n')

    return qaPairs
  }

  private async consolidateRefinement(
    context: Reviewontext,
    scope: string,
    qaPairs: Array<{ question: string; answer: string }>
  ): Promise<void> {
    const productDir = context.config.productDir ?? join(context.workingDir, 'docs', 'product')
    const refinementPath = join(productDir, 'REFINEMENT.md')

    const qaFormatted = qaPairs.length > 0
      ? qaPairs.map((pair, idx) => `| ${idx + 1} | ${pair.question} | ${pair.answer} |`).join('\n')
      : '| - | No specific questions answered | - |'

    const prompt = [
      `<objective>`,
      `Given the project scope and human-validated Q&A pairs below, produce a structured`,
      `refinement document that captures architectural decisions, constraints, risks, and`,
      `design guidelines derived from the conversation.`,
      `</objective>`,
      ``,
      `<output_file>`,
      refinementPath,
      `</output_file>`,
      ``,
      `<output_format>`,
      `Write the file with exactly this structure (Markdown):`,
      ``,
      `# Refinement — Project Context`,
      ``,
      `## Architectural Decisions`,
      `## Constraints & Boundaries`,
      `## Identified Risks`,
      `## Quality Requirements`,
      `## Design Guidelines`,
      `## Q&A Record`,
      `| # | Question | Answer |`,
      `| --- | --- | --- |`,
      `<qa_table_placeholder>`,
      `</output_format>`,
      ``,
      `<rules>`,
      `- Base every section strictly on the scope and Q&A pairs provided; do not invent`,
      `  requirements that contradict them.`,
      `- The "Q&A Record" table must reproduce the <qa_pairs> content verbatim, unmodified.`,
      `- Keep each bullet point concise and actionable (one decision/risk/constraint per line).`,
      `- If a section has no applicable content, write "None identified." under its heading`,
      `  instead of omitting the heading.`,
      `</rules>`,
      ``,
      `<scope>`,
      '```markdown',
      scope.trim(),
      '```',
      `</scope>`,
      ``,
      `<qa_pairs>`,
      qaFormatted,
      `</qa_pairs>`,
    ].join('\n')

    await context.invokeAgent({
      agent: 'harness-kit:software-architect',
      mode: 'autonomous',
      prompt,
      phaseKey: 'planning',
    })
  }
}
