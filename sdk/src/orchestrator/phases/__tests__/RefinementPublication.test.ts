import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RefinementHandler } from '../RefinementHandler'
import { Phase } from '../../types'
import { refinementForPrompt } from '../../../../tests/fixtures/pbb-refinement'

const input = vi.hoisted(() => vi.fn())
vi.mock('@inquirer/prompts', () => ({ input }))
const contract = readFileSync(resolve(__dirname, '../../../../../skills/pbb-design/references/output-contract.md'), 'utf8')
const example = contract.split('```markdown\n')[1].split('\n```')[0] + '\n\n## Frontend Screens & Visualization\nNone identified.\n'
const directories: string[] = []
afterEach(() => {
  vi.clearAllMocks()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function createContext(output: (path: string, prompt: string) => string) {
  const workingDir = mkdtempSync(join(tmpdir(), 'pbb-refinement-'))
  directories.push(workingDir)
  const saveRefinement = vi.fn()
  const questions = [1, 2, 3, 4].map(id => ({
    id, question: `Question ${id}?`, recommendation: `Recommendation ${id}`, context: `Context ${id}`,
  }))
  const invokeAgent = vi.fn().mockImplementation(async ({ phaseKey, prompt }) => {
    if (phaseKey === 'refinement_questions') return { raw: JSON.stringify(questions) }
    const path = prompt.match(/<output_file>\s*([^\r\n]+)\s*<\/output_file>/)?.[1]
    return { raw: output(path, prompt) }
  })
  return {
    workingDir,
    config: { enableRefinement: true, scope: 'Scope', projectPaths: [], productDir: join(workingDir, 'product') },
    fsm: { existRefinement: vi.fn().mockReturnValue(false), existScope: () => false, saveRefinement },
    invokeAgent,
  }
}

describe('refinement publication', () => {
  it('preserves accepted, replaced, deferred and unknown answers with numeric question IDs', async () => {
    vi.mocked(input).mockResolvedValueOnce('').mockResolvedValueOnce('Different rule')
      .mockResolvedValueOnce('/defer').mockResolvedValueOnce('/unknown').mockResolvedValueOnce('Additional context')
    const context = createContext((_path, prompt) => refinementForPrompt(prompt))
    await new RefinementHandler().handle(Phase.REFINEMENT, context as never)
    const prompt = context.invokeAgent.mock.calls[1][0].prompt as string
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
    vi.mocked(input).mockResolvedValueOnce('Use the current framework').mockResolvedValueOnce('')
    const context = createContext((_path, prompt) => refinementForPrompt(prompt))
    context.invokeAgent.mockResolvedValueOnce({ raw: JSON.stringify([
      { id: 5, question: 'Framework?', recommendation: 'Existing', context: 'Setup', category: 'setup' },
    ]) })
    await new RefinementHandler().handle(Phase.REFINEMENT, context as never)
    const prompt = context.invokeAgent.mock.calls[1][0].prompt as string
    expect(prompt).toContain('"category": "setup"')
    expect(context.fsm.saveRefinement.mock.calls[0][0]).not.toContain('### Q05')
  })

  it('replaces a stale questions file when discovery returns an empty array', async () => {
    vi.mocked(input).mockResolvedValue('')
    const context = createContext((_path, prompt) => refinementForPrompt(prompt))
    context.invokeAgent.mockResolvedValueOnce({ raw: '[]' })
    await new RefinementHandler().handle(Phase.REFINEMENT, context as never)
    expect(JSON.parse(readFileSync(join(context.config.productDir, 'QUESTIONS.json'), 'utf8'))).toEqual([])
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
    expect(context.fsm.saveRefinement).not.toHaveBeenCalled()
  })
})
