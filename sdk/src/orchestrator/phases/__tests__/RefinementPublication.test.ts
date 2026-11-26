import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RefinementHandler } from '../RefinementHandler'
import { PlanningHandler } from '../PlanningHandler'
import { Phase } from '../../types'
import { FileStateManager } from '../../../file-state/FileStateManager'
import { refinementForPrompt } from '../../../../tests/fixtures/pbb-refinement'

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

function createContext(output: (path: string, prompt: string) => string) {
  const workingDir = mkdtempSync(join(tmpdir(), 'pbb-refinement-'))
  directories.push(workingDir)
  const productDir = join(workingDir, 'product')
  const state = new FileStateManager({ productDir })
  const saveRefinement = vi.fn()
  const invokeAgent = vi.fn().mockImplementation(async ({ phaseKey, prompt }) => {
    if (phaseKey === 'refinement_questions') return { raw: '[]' }
    const path = prompt.match(/<output_file>\s*([^\r\n]+)\s*<\/output_file>/)?.[1]
    return { raw: output(path, prompt) }
  })
  return {
    workingDir,
    config: { enableRefinement: true, scope: 'Scope', projectPaths: [], productDir },
    fsm: {
      existRefinement: vi.fn().mockReturnValue(false), existScope: () => false, saveRefinement,
      saveRefinementEvidence: state.saveRefinementEvidence.bind(state),
    },
    invokeAgent,
  }
}

describe('refinement publication', () => {
  it('rejects an invented approval used to confirm the order of two PBIs', async () => {
    vi.mocked(input).mockResolvedValue('')
    const context = createContext(() => example)
    context.invokeAgent.mockResolvedValueOnce({ raw: '[]' })
    await expect(new RefinementHandler().handle(Phase.REFINEMENT, context as never))
      .rejects.toThrow(/Q01.*evidence/i)
    expect(context.fsm.saveRefinement).not.toHaveBeenCalled()
  })

  it('repairs proposed priorities without reasking questions or publishing the rejected draft', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.mocked(input).mockResolvedValue('').mockResolvedValueOnce('Keep both course views')
    let rejectedDraft = ''
    let initialPath = ''
    const context = createContext((path, prompt) => {
      const draft = refinementForPrompt(prompt)
      if (!rejectedDraft) {
        initialPath = path
        rejectedDraft = draft
          .replaceAll('Priority status: confirmed', 'Priority status: proposed')
          .replaceAll('S01 establishes showing levels as the first release.', 'S01 suggests showing levels first.')
        writeFileSync(path, rejectedDraft)
        return '{}'
      }

      expect(context.fsm.saveRefinement).not.toHaveBeenCalled()
      expect(path).not.toBe(initialPath)
      expect(prompt).toContain('PBI01: Priority reason requires a referenced inference')
      expect(prompt).toContain('PBI02: Priority reason requires a referenced inference')
      expect(prompt).toContain('"answer": "Keep both course views"')
      const rejectedPath = prompt.match(/<rejected_refinement_ref>\s*Read file: `([^`]+)`/)?.[1]
      expect(readFileSync(rejectedPath!, 'utf8')).toBe(rejectedDraft)
      return draft
        .replaceAll('Priority status: confirmed', 'Priority status: proposed')
        .replaceAll('S01 establishes showing levels as the first release.', 'A01 proposes showing levels first to reduce individual page visits.')
        .replaceAll('Decision refs: []', 'Decision refs: [A01]')
        .replaceAll('| EX01 | [] |', '| EX01 | A01 |')
        .replace('## 8. Assumptions\n[]', [
          '## 8. Assumptions', '### A01 — Prefer showing levels first',
          'Statement: Showing levels first may reduce individual page visits.', 'Basis: [S01]',
          'Affects: [PBI01, PBI02]', 'Validation: Confirm delivery order with the catalogue team.',
        ].join('\n'))
    })
    context.invokeAgent.mockResolvedValueOnce({ raw: JSON.stringify([
      { id: 1, question: 'Which views are in scope?', recommendation: 'Show one view', context: 'Scope' },
    ]) })

    await expect(new RefinementHandler().handle(Phase.REFINEMENT, context as never)).resolves.toBe(Phase.BOOTSTRAP)

    expect(input).toHaveBeenCalledTimes(3)
    expect(context.invokeAgent.mock.calls.filter(([invocation]) => invocation.phaseKey === 'refinement_consolidation')).toHaveLength(2)
    expect(context.fsm.saveRefinement).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Priority reason: A01'))
  })

  it.each([
    ['Use A320 for this model.', 'Use A320 for this model.'],
    ['Keep the original order.\r\nInclude the two variants.\n', 'json:"Keep the original order.\\r\\nInclude the two variants.\\n"'],
  ])('publishes the original answer %j', async (answer, serialized) => {
    const multiline = answer.includes('\n')
    vi.mocked(input).mockResolvedValue('').mockResolvedValueOnce(multiline ? '/edit' : answer)
    vi.mocked(editor).mockResolvedValue(answer)
    const context = createContext((_path, prompt) => refinementForPrompt(prompt)
      .replace(/^Resolved answer: .*$/m, () => `Resolved answer: ${serialized}`))
    context.invokeAgent.mockResolvedValueOnce({ raw: JSON.stringify([
      { id: 1, question: 'What applies?', recommendation: 'Default', context: 'Scope' },
    ]) })
    await new RefinementHandler().handle(Phase.REFINEMENT, context as never)
    expect(editor).toHaveBeenCalledTimes(multiline ? 1 : 0)
    expect(context.fsm.saveRefinement).toHaveBeenCalledWith(expect.stringContaining(`Resolved answer: ${serialized}`))
  })

  it('recomputes pending questions and publishes only after the corrected draft is displayed and approved', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const context = createContext((_path, prompt) => {
      const draft = refinementForPrompt(prompt)
        .replace(/### PBI02 — [\s\S]*?(?=## 7\. Traceability)/, '')
        .replace(/^\| PBI02 .*\n/m, '')
      return draft.includes('List the existing level labels')
        ? draft.replace('Outcome: The learner sees the level in the list for each course that has one.', 'Outcome: List the existing level labels.')
        : draft
    })
    const questions = [
      { id: 1, question: 'Keep filtering?', recommendation: 'Yes', context: 'Scope' },
      { id: 2, question: 'Which filters should be supported?', recommendation: 'Level', context: 'Behavior' },
    ]
    context.invokeAgent.mockResolvedValueOnce({ raw: JSON.stringify(questions) })
      .mockImplementationOnce(async ({ prompt }) => {
        expect(prompt).toContain('Remove filtering')
        expect(prompt).toContain(questions[1].question)
        return { raw: '[]' }
      })
    vi.mocked(input).mockResolvedValue('')
      .mockResolvedValueOnce('Remove filtering')
      .mockResolvedValueOnce('')
      .mockImplementationOnce(async () => {
        expect(log.mock.calls.map(args => args.join(' ')).join('\n')).toContain('Delivery rank: 1')
        expect(context.fsm.saveRefinement).not.toHaveBeenCalled()
        return 'List the existing level labels'
      })
      .mockImplementationOnce(async () => {
        expect(context.fsm.saveRefinement).not.toHaveBeenCalled()
        return ''
      })

    await new RefinementHandler().handle(Phase.REFINEMENT, context as never)

    expect(log.mock.calls.map(args => args.join(' ')).join('\n')).not.toContain(questions[1].question)
    const drafts = context.invokeAgent.mock.calls.filter(([args]) => args.phaseKey === 'refinement_consolidation')
    expect(drafts).toHaveLength(2)
    expect(drafts[1][0].prompt).toContain('List the existing level labels')
    expect(drafts[1][0].prompt).toContain('<refinement_draft>')
    expect(context.fsm.saveRefinement).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Outcome: List the existing level labels.'))
    expect(context.fsm.saveRefinement.mock.calls[0][0]).not.toContain('### PBI02')
  })

  it.each([false, true])('carries the recorded setup choice into Planning after re-entry (session=%s)', async reuseSession => {
    vi.mocked(input).mockResolvedValue('').mockResolvedValueOnce('Use Fastify')
    const context = createContext((_path, prompt) => refinementForPrompt(prompt))
    context.invokeAgent.mockResolvedValueOnce({ raw: JSON.stringify([
      { id: 5, question: 'Which web framework?', recommendation: 'Express', context: 'Setup', category: 'setup' },
    ]) })
    const state = new FileStateManager({ productDir: context.config.productDir })
    await new RefinementHandler().handle(Phase.REFINEMENT, { ...context, fsm: state } as never)
    expect(state.loadRefinement()).not.toContain('Use Fastify')

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
    const context = createContext((_path, prompt) => refinementForPrompt(prompt))
    const questions = [1, 2, 3, 4].map(id => ({
      id, question: `Question ${id}?`, recommendation: `Recommendation ${id}`, context: `Context ${id}`,
    }))
    context.invokeAgent.mockResolvedValueOnce({ raw: JSON.stringify(questions) })
    for (const question of questions.slice(1)) {
      context.invokeAgent.mockResolvedValueOnce({ raw: JSON.stringify([question]) })
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
    expect(context.fsm.saveRefinement).toHaveBeenCalledWith(refinementForPrompt(prompt).trim())
  })

  it('accepts a valid staged file when the agent returns no document', async () => {
    vi.mocked(input).mockResolvedValue('')
    let candidate = ''
    const context = createContext((path, prompt) => { candidate = refinementForPrompt(prompt); writeFileSync(path, candidate); return '{}' })
    await new RefinementHandler().handle(Phase.REFINEMENT, context as never)
    expect(context.fsm.saveRefinement).toHaveBeenCalledWith(candidate.trim())
  })

  it('rejects duplicate numeric question IDs instead of conflating decisions', async () => {
    const context = createContext((_path, prompt) => refinementForPrompt(prompt))
    context.invokeAgent.mockResolvedValueOnce({ raw: JSON.stringify([
      { id: 1, question: 'First?', recommendation: 'A', context: 'C' },
      { id: 1, question: 'Second?', recommendation: 'B', context: 'C' },
    ]) })
    await expect(new RefinementHandler().handle(Phase.REFINEMENT, context as never)).rejects.toThrow(/question.*id/i)
    expect(context.fsm.saveRefinement).not.toHaveBeenCalled()
  })

  it('keeps setup responses outside business question records', async () => {
    vi.mocked(input).mockResolvedValue('').mockResolvedValueOnce('Use the current framework')
    const context = createContext((_path, prompt) => refinementForPrompt(prompt))
    context.invokeAgent.mockResolvedValueOnce({ raw: JSON.stringify([
      { id: 5, question: 'Framework?', recommendation: 'Existing', context: 'Setup', category: 'setup' },
    ]) })
    await new RefinementHandler().handle(Phase.REFINEMENT, context as never)
    const prompt = context.invokeAgent.mock.calls.find(([args]) => args.phaseKey === 'refinement_consolidation')![0].prompt as string
    expect(prompt).toContain('numeric setup IDs when assigning new Q IDs: [5]')
    expect(prompt).not.toContain('Use the current framework')
    expect(context.fsm.saveRefinement.mock.calls[0][0]).not.toContain('### Q05')
  })

  it('replaces a stale questions file when discovery returns an empty array', async () => {
    vi.mocked(input).mockResolvedValue('')
    const context = createContext((_path, prompt) => refinementForPrompt(prompt))
    context.invokeAgent.mockResolvedValueOnce({ raw: '[]' })
    await new RefinementHandler().handle(Phase.REFINEMENT, context as never)
    expect(JSON.parse(readFileSync(join(context.config.productDir, 'QUESTIONS.json'), 'utf8'))).toEqual([])
  })

  it('leaves the canonical refinement unpublished if the user exits during draft review', async () => {
    vi.mocked(input).mockResolvedValueOnce('').mockRejectedValueOnce(new Error('Review cancelled'))
    const context = createContext((_path, prompt) => refinementForPrompt(prompt))
    await expect(new RefinementHandler().handle(Phase.REFINEMENT, context as never)).rejects.toThrow('Review cancelled')
    expect(context.fsm.saveRefinement).not.toHaveBeenCalled()
  })

  it.each(['', '{}', example.replace('Functionality: FN01', 'Functionality: FN99')])(
    'rejects invalid returned content without publishing', async raw => {
      vi.mocked(input).mockResolvedValue('')
      const context = createContext(() => raw)
      await expect(new RefinementHandler().handle(Phase.REFINEMENT, context as never)).rejects.toThrow(/invalid.*refinement/i)
      expect(context.fsm.saveRefinement).not.toHaveBeenCalled()
    },
  )

  it('rejects a partial staged file even when the agent returns valid content', async () => {
    vi.mocked(input).mockResolvedValue('')
    const context = createContext(path => { writeFileSync(path, '{}'); return example })
    await expect(new RefinementHandler().handle(Phase.REFINEMENT, context as never)).rejects.toThrow(/invalid.*refinement/i)
    expect(context.invokeAgent.mock.calls.filter(([invocation]) => invocation.phaseKey === 'refinement_consolidation')).toHaveLength(2)
    expect(context.fsm.saveRefinement).not.toHaveBeenCalled()
  })
})
