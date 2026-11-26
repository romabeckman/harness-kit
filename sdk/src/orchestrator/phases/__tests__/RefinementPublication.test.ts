import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RefinementHandler } from '../RefinementHandler'
import { PlanningHandler } from '../PlanningHandler'
import { Phase } from '../../types'
import { FileStateManager } from '../../../file-state/FileStateManager'
import * as pbbContract from '../../utils/PbbContract'
import { refinementForPrompt, writeQuestionsForPrompt, writeRefinementForPrompt } from '../../../../tests/fixtures/pbb-refinement'

const { input, editor } = vi.hoisted(() => ({ input: vi.fn(), editor: vi.fn() }))
vi.mock('@inquirer/prompts', () => ({ input, editor }))
const contract = readFileSync(resolve(__dirname, '../../../../../skills/pbb-design/references/output-contract.md'), 'utf8')
const example = contract.split('```markdown\n')[1].split('\n```')[0] + '\n\n## Frontend Screens & Visualization\nNone identified.\n'
const directories: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  input.mockReset()
  editor.mockReset()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function createContext(refinement: (prompt: string) => string = refinementForPrompt) {
  const workingDir = mkdtempSync(join(tmpdir(), 'pbb-refinement-'))
  directories.push(workingDir)
  const productDir = join(workingDir, 'product')
  const state = new FileStateManager({ productDir })
  vi.spyOn(state, 'saveRefinement')
  const invokeAgent = vi.fn().mockImplementation(async ({ phaseKey, prompt }) => {
    if (phaseKey === 'refinement_questions') {
      writeQuestionsForPrompt(prompt, [])
    } else {
      writeRefinementForPrompt(prompt, refinement(prompt))
    }
  })
  return {
    workingDir,
    config: { enableRefinement: true, scope: 'Scope', projectPaths: [], productDir },
    fsm: state,
    invokeAgent,
  }
}

describe('refinement publication', () => {
  it('advances to Bootstrap without publishing an invented approval', async () => {
    vi.mocked(input).mockResolvedValue('')
    const context = createContext(() => example)
    await expect(new RefinementHandler().handle(Phase.REFINEMENT, context as never)).resolves.toBe(Phase.BOOTSTRAP)
    const refinement = readFileSync(join(context.config.productDir, 'REFINEMENT.md'), 'utf8')
    expect(refinement).toContain('Scope')
    expect(refinement).not.toContain('Human validated')
  })

  it('saves the scope and collected answers when the generated document is invalid', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(input).mockResolvedValue('').mockResolvedValueOnce('Keep both course views')
    const context = createContext(prompt => refinementForPrompt(prompt)
      .replaceAll('Priority status: confirmed', 'Priority status: proposed'))
    context.invokeAgent.mockImplementationOnce(async ({ prompt }) => writeQuestionsForPrompt(prompt, [
      { id: 1, question: 'Which views are in scope?', recommendation: 'Show one view', context: 'Scope' },
    ]))

    await expect(new RefinementHandler().handle(Phase.REFINEMENT, context as never)).resolves.toBe(Phase.BOOTSTRAP)

    expect(input).toHaveBeenCalledTimes(2)
    expect(context.invokeAgent.mock.calls.filter(([invocation]) => invocation.phaseKey === 'refinement_consolidation')).toHaveLength(2)
    const refinement = readFileSync(join(context.config.productDir, 'REFINEMENT.md'), 'utf8')
    expect(refinement).toContain('Scope')
    expect(refinement).toContain('Which views are in scope?')
    expect(refinement).toContain('Keep both course views')
    expect(refinement).not.toContain('Priority status: proposed')
  })

  it('repairs a divergent draft once and publishes the corrected decisions before Bootstrap', async () => {
    vi.mocked(input).mockResolvedValue('').mockResolvedValueOnce('Keep both views')
    let corrected = ''
    const context = createContext(prompt => {
      expect(context.fsm.existRefinement()).toBe(false)
      const candidate = refinementForPrompt(prompt)
      if (prompt.includes('<validation_issues>')) {
        expect(prompt).toContain('Q01: Resolved answer differs from refinement evidence')
        expect(prompt).toContain('"answer": "Keep both views"')
        corrected = candidate
        return candidate
      }
      return candidate.replace('Resolved answer: Keep both views', 'Resolved answer: Use one view')
    })
    context.invokeAgent.mockImplementationOnce(async ({ prompt }) => writeQuestionsForPrompt(prompt, [
      { id: 1, question: 'Which views are in scope?', recommendation: 'Use one view', context: 'Scope' },
    ]))

    await expect(new RefinementHandler().handle(Phase.REFINEMENT, context as never)).resolves.toBe(Phase.BOOTSTRAP)

    const consolidation = context.invokeAgent.mock.calls.filter(([args]) => args.phaseKey === 'refinement_consolidation')
    expect(consolidation).toHaveLength(2)
    expect(corrected).toContain('Resolved answer: Keep both views')
    expect(context.fsm.loadRefinement()).toBe(corrected.trim())
  })

  it('preserves the recorded scope and continues when the correction agent fails', async () => {
    vi.mocked(input).mockResolvedValue('')
    const context = createContext(prompt => {
      if (prompt.includes('<validation_issues>')) throw new Error('Correction failed')
      return '# Incomplete refinement'
    })

    await expect(new RefinementHandler().handle(Phase.REFINEMENT, context as never)).resolves.toBe(Phase.BOOTSTRAP)
    expect(context.invokeAgent.mock.calls.filter(([args]) => args.phaseKey === 'refinement_consolidation')).toHaveLength(2)
    expect(context.fsm.loadRefinement()).toContain('## Business answers')
  })

  it('continues with the recorded scope when the validator throws', async () => {
    vi.mocked(input).mockResolvedValue('')
    vi.spyOn(pbbContract, 'validatePbbContract').mockImplementation(() => {
      throw new Error('Validation failed')
    })
    const context = createContext()

    await expect(new RefinementHandler().handle(Phase.REFINEMENT, context as never)).resolves.toBe(Phase.BOOTSTRAP)
    const consolidation = context.invokeAgent.mock.calls.filter(([args]) => args.phaseKey === 'refinement_consolidation')
    expect(consolidation).toHaveLength(2)
    expect(consolidation[1][0].prompt).toContain('Check the full draft against the PBB contract and recorded evidence.')
    expect(context.fsm.loadRefinement()).toContain('## Business answers')
  })

  it.each([
    ['Use A320 for this model.', 'Use A320 for this model.'],
    ['Keep the original order.\r\nInclude the two variants.\n', 'json:"Keep the original order.\\r\\nInclude the two variants.\\n"'],
  ])('publishes the original answer %j', async (answer, serialized) => {
    const multiline = answer.includes('\n')
    vi.mocked(input).mockResolvedValue('').mockResolvedValueOnce(multiline ? '/edit' : answer)
    vi.mocked(editor).mockResolvedValue(answer)
    const context = createContext(prompt => refinementForPrompt(prompt)
      .replace(/^Resolved answer: .*$/m, () => `Resolved answer: ${serialized}`))
    context.invokeAgent.mockImplementationOnce(async ({ prompt }) => writeQuestionsForPrompt(prompt, [
      { id: 1, question: 'What applies?', recommendation: 'Default', context: 'Scope' },
    ]))
    await new RefinementHandler().handle(Phase.REFINEMENT, context as never)
    expect(editor).toHaveBeenCalledTimes(multiline ? 1 : 0)
    expect(context.fsm.loadRefinement()).toContain(`Resolved answer: ${serialized}`)
  })

  it('recomputes pending questions and publishes the refinement before advancing directly to Bootstrap', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const context = createContext(prompt =>
      refinementForPrompt(prompt)
        .replace(/### PBI02 — [\s\S]*?(?=## 7\. Traceability)/, '')
        .replace(/^\| PBI02 .*\n/m, '')
    )
    const questions = [
      { id: 1, question: 'Keep filtering?', recommendation: 'Yes', context: 'Scope' },
      { id: 2, question: 'Which filters should be supported?', recommendation: 'Level', context: 'Behavior' },
    ]
    context.invokeAgent.mockImplementationOnce(async ({ prompt }) => {
      writeQuestionsForPrompt(prompt, questions)
      return { raw: '[]' }
    })
      .mockImplementationOnce(async ({ prompt }) => {
        expect(prompt).toContain('Remove filtering')
        expect(prompt).toContain(questions[1].question)
        writeQuestionsForPrompt(prompt, [])
      })
    vi.mocked(input).mockRejectedValue(new Error('Unexpected prompt after refinement questions'))
      .mockResolvedValueOnce('Remove filtering')
      .mockResolvedValueOnce('')

    await expect(new RefinementHandler().handle(Phase.REFINEMENT, context as never)).resolves.toBe(Phase.BOOTSTRAP)

    expect(input).toHaveBeenCalledTimes(2)
    expect(log.mock.calls.map(args => args.join(' ')).join('\n')).not.toContain(questions[1].question)
    expect(context.invokeAgent.mock.calls.filter(([args]) => args.phaseKey === 'refinement_consolidation')).toHaveLength(1)
    const refinement = readFileSync(join(context.config.productDir, 'REFINEMENT.md'), 'utf8')
    expect(refinement).toContain('Resolved answer: Remove filtering')
    expect(refinement).not.toContain('### PBI02')
  })

  it.each([false, true])('carries the recorded setup choice into Planning after re-entry (session=%s)', async reuseSession => {
    vi.mocked(input).mockResolvedValue('').mockResolvedValueOnce('Use Fastify')
    const context = createContext()
    context.invokeAgent.mockImplementationOnce(async ({ prompt }) => writeQuestionsForPrompt(prompt, [
      { id: 5, question: 'Which web framework?', recommendation: 'Express', context: 'Setup', category: 'setup' },
    ]))
    await new RefinementHandler().handle(Phase.REFINEMENT, context as never)
    expect(context.fsm.loadRefinement()).not.toContain('Use Fastify')

    const resumedState = new FileStateManager({ productDir: context.config.productDir })
    const feature = { id: 'F001', title: 'Levels', domain: 'courses', dependencies: [], status: 'IN_PROGRESS' }
    vi.spyOn(resumedState, 'loadBacklog').mockReturnValue([feature] as never)
    vi.spyOn(resumedState, 'loadBootstrapConfig').mockReturnValue({ steeringRules: [] } as never)
    vi.spyOn(resumedState, 'saveBootstrapConfig').mockImplementation(() => {})
    vi.spyOn(resumedState, 'loadDevelopmentState').mockReturnValue([])
    vi.spyOn(resumedState, 'appendTasks').mockImplementation(() => {})
    vi.spyOn(resumedState, 'appendDecision').mockImplementation(() => {})
    const invokeAgent = vi.fn().mockResolvedValue({ raw: '' })
    await new PlanningHandler().handle(Phase.PLANNING, {
      workingDir: context.workingDir,
      config: { ...context.config, scope: '', enableRefinement: false },
      fsm: resumedState,
      invokeAgent,
      getActiveFeature: () => feature,
      checkSpecFilesPresent: () => false,
      extractTasksFromTacticalDesign: () => [{ taskId: 'T001', description: 'Task', file: 'project' }],
      getDeveloperSession: () => reuseSession ? { id: 'session' } : undefined,
    } as never)
    const prompt = invokeAgent.mock.calls[0][0].prompt as string
    const decisions = JSON.parse(prompt.match(/^<setup_decisions>\s*([\s\S]*?)\s*<\/setup_decisions>/m)![1])
    expect(decisions).toMatchObject([{
      id: 5, recommendation: 'Express', answer: 'Use Fastify', answeredBy: 'human', status: 'Human validated',
    }])
  })

  it('preserves accepted, replaced, deferred and unknown answers with numeric question IDs', async () => {
    vi.mocked(input).mockResolvedValueOnce('').mockResolvedValueOnce('Different rule')
      .mockResolvedValueOnce('/defer').mockResolvedValueOnce('/unknown').mockResolvedValueOnce('Additional context')
      .mockResolvedValue('')
    const context = createContext()
    const questions = [1, 2, 3, 4].map(id => ({
      id, question: `Question ${id}?`, recommendation: `Recommendation ${id}`, context: `Context ${id}`,
    }))
    context.invokeAgent.mockImplementationOnce(async ({ prompt }) => writeQuestionsForPrompt(prompt, questions))
    for (const question of questions.slice(1)) {
      context.invokeAgent.mockImplementationOnce(async ({ prompt }) => writeQuestionsForPrompt(prompt, [question]))
    }
    await new RefinementHandler().handle(Phase.REFINEMENT, context as never)
    const prompt = context.invokeAgent.mock.calls.find(([args]) => args.phaseKey === 'refinement_consolidation')![0].prompt as string
    const evidence = JSON.parse(prompt.match(/^<refinement_evidence>\s*([\s\S]*?)\s*<\/refinement_evidence>/m)![1])
    expect(evidence).toMatchObject([
      { id: 1, answer: 'Recommendation 1', answeredBy: 'human', status: 'Human validated' },
      { id: 2, answer: 'Different rule', answeredBy: 'human', status: 'Human validated' },
      { id: 3, answer: 'Unresolved', answeredBy: 'unresolved', status: 'Deferred' },
      { id: 4, answer: 'Unresolved', answeredBy: 'unresolved', status: 'Unknown' },
      { id: 5, answer: 'Additional context', answeredBy: 'human', status: 'Human validated' },
    ])
    expect(context.fsm.loadRefinement()).toBe(refinementForPrompt(prompt).trim())
  })

  it('publishes a valid draft as written and cleans up its staging file', async () => {
    vi.mocked(input).mockResolvedValue('')
    let candidate = ''
    let draftPath = ''
    const context = createContext(prompt => {
      const path = join(context.config.productDir, 'REFINEMENT.md')
      draftPath = prompt.match(/<output_file>\n([^\n]+)\n<\/output_file>/)![1]
      expect(draftPath).not.toBe(path)
      expect(existsSync(path)).toBe(false)
      expect(readFileSync(join(context.config.productDir, 'QUESTIONS.json'), 'utf8')).toBe('[]')
      candidate = refinementForPrompt(prompt)
      return candidate
    })
    await new RefinementHandler().handle(Phase.REFINEMENT, context as never)
    expect(context.fsm.saveRefinement).toHaveBeenCalledExactlyOnceWith(candidate)
    expect(existsSync(draftPath)).toBe(false)
    expect(readFileSync(join(context.config.productDir, 'REFINEMENT.md'), 'utf8')).toBe(candidate)
  })

  it('rejects duplicate numeric question IDs instead of conflating decisions', async () => {
    const context = createContext()
    context.invokeAgent.mockImplementationOnce(async ({ prompt }) => writeQuestionsForPrompt(prompt, [
      { id: 1, question: 'First?', recommendation: 'A', context: 'C' },
      { id: 1, question: 'Second?', recommendation: 'B', context: 'C' },
    ]))
    await expect(new RefinementHandler().handle(Phase.REFINEMENT, context as never)).rejects.toThrow(/question.*id/i)
    expect(context.fsm.saveRefinement).not.toHaveBeenCalled()
  })

  it('keeps setup responses outside business question records', async () => {
    vi.mocked(input).mockResolvedValue('').mockResolvedValueOnce('Use the current framework')
    const context = createContext()
    context.invokeAgent.mockImplementationOnce(async ({ prompt }) => writeQuestionsForPrompt(prompt, [
      { id: 5, question: 'Framework?', recommendation: 'Existing', context: 'Setup', category: 'setup' },
    ]))
    await new RefinementHandler().handle(Phase.REFINEMENT, context as never)
    const prompt = context.invokeAgent.mock.calls.find(([args]) => args.phaseKey === 'refinement_consolidation')![0].prompt as string
    expect(prompt).toContain('numeric setup IDs when assigning new Q IDs: [5]')
    expect(prompt).not.toContain('Use the current framework')
    expect(context.fsm.loadRefinement()).not.toContain('### Q05')
  })

  it('replaces a stale questions file when discovery returns an empty array', async () => {
    vi.mocked(input).mockResolvedValue('')
    const context = createContext()
    await new RefinementHandler().handle(Phase.REFINEMENT, context as never)
    expect(JSON.parse(readFileSync(join(context.config.productDir, 'QUESTIONS.json'), 'utf8'))).toEqual([])
  })

  it('leaves the canonical refinement unpublished if the user exits during discovery', async () => {
    vi.mocked(input).mockRejectedValueOnce(new Error('Discovery cancelled'))
    const context = createContext()
    await expect(new RefinementHandler().handle(Phase.REFINEMENT, context as never)).rejects.toThrow('Discovery cancelled')
    expect(context.fsm.saveRefinement).not.toHaveBeenCalled()
  })

  it.each(['', '{}', example.replace('Functionality: FN01', 'Functionality: FN99')])(
    'continues with the scope when the agent writes an invalid document', async content => {
      vi.mocked(input).mockResolvedValue('')
      const context = createContext(() => content)
      await expect(new RefinementHandler().handle(Phase.REFINEMENT, context as never)).resolves.toBe(Phase.BOOTSTRAP)
      expect(context.fsm.saveRefinement).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Scope'))
    },
  )

  it('ignores returned Markdown when the agent does not write REFINEMENT.md', async () => {
    vi.mocked(input).mockResolvedValue('')
    const context = createContext()
    context.invokeAgent.mockImplementationOnce(async ({ prompt }) => writeQuestionsForPrompt(prompt, []))
      .mockImplementationOnce(async ({ prompt }) => ({ raw: refinementForPrompt(prompt) }))
    await expect(new RefinementHandler().handle(Phase.REFINEMENT, context as never)).resolves.toBe(Phase.BOOTSTRAP)
    expect(context.fsm.saveRefinement).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('## Scope'))
  })

  it('keeps incomplete Markdown out of the final file when consolidation fails after writing', async () => {
    vi.mocked(input).mockResolvedValue('')
    const context = createContext()
    const failure = new Error('Agent stopped')
    context.invokeAgent.mockImplementationOnce(async ({ prompt }) => writeQuestionsForPrompt(prompt, []))
      .mockImplementationOnce(async ({ prompt }) => {
        writeRefinementForPrompt(prompt, '# Incomplete refinement')
        throw failure
      })

    await expect(new RefinementHandler().handle(Phase.REFINEMENT, context as never)).rejects.toBe(failure)

    expect(context.fsm.loadRefinement()).toContain('## Business answers')
  })
})
