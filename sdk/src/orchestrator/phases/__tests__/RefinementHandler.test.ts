import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RefinementHandler } from '../RefinementHandler'
import { Phase } from '../../types'
import { ChainBuilder } from '../../ChainBuilder'
import { FORCE_INLINE_MAX } from '../../utils/PromptHelpers'

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn().mockImplementation(async ({ default: defVal }) => defVal ?? 'User specified answer'),
}))

describe('RefinementHandler', () => {
  let handler: RefinementHandler
  let mockContext: any
  let mockFsm: any

  beforeEach(() => {
    mockFsm = {
      existScope: vi.fn().mockReturnValue(true),
      loadScope: vi.fn().mockReturnValue('Test scope text'),
      existRefinement: vi.fn().mockReturnValue(false),
      saveRefinement: vi.fn(),
    }

    mockContext = {
      workingDir: '/test/dir',
      fsm: mockFsm,
      config: {
        enableRefinement: true,
        projectPaths: ['/test/project'],
        scope: 'Test scope text',
        productDir: '/test/dir/docs/product',
      },
      invokeAgent: vi.fn().mockResolvedValue({
        raw: '[{"id":1,"question":"Q1","recommendation":"R1","context":"C1"}]',
      }),
    }

    handler = new RefinementHandler()
  })

  it('passes through to Phase.PLANNING when enableRefinement is false', async () => {
    mockContext.config.enableRefinement = false
    const next = await handler.handle(Phase.REFINEMENT, mockContext)
    expect(next).toBe(Phase.PLANNING)
    expect(mockContext.invokeAgent).not.toHaveBeenCalled()
  })

  it('passes through to Phase.PLANNING when REFINEMENT.md already exists', async () => {
    mockFsm.existRefinement.mockReturnValue(true)
    const next = await handler.handle(Phase.REFINEMENT, mockContext)
    expect(next).toBe(Phase.PLANNING)
    expect(mockContext.invokeAgent).not.toHaveBeenCalled()
  })

  it('executes Q&A flow and saves refinement and QUESTIONS.json when enabled and not already existing', async () => {
    const { mkdtempSync, rmSync, existsSync, readFileSync } = await import('fs')
    const { tmpdir } = await import('os')
    const { join } = await import('path')

    const tmpDir = mkdtempSync(join(tmpdir(), 'refinement-test-'))
    const productDir = join(tmpDir, 'docs', 'product')
    mockContext.workingDir = tmpDir
    mockContext.config.productDir = productDir

    const savedContent: string[] = []
    mockFsm.saveRefinement = vi.fn().mockImplementation((content: string) => {
      savedContent.push(content)
    })

    const next = await handler.handle(Phase.REFINEMENT, mockContext)
    expect(next).toBe(Phase.PLANNING)
    expect(mockContext.invokeAgent).toHaveBeenCalledTimes(2)
    expect(mockContext.invokeAgent.mock.calls[0][0].agent).toBe('harness-kit:software-architect')
    expect(mockContext.invokeAgent.mock.calls[0][0].skill).toBeUndefined()
    expect(mockContext.invokeAgent.mock.calls[1][0].agent).toBe('harness-kit:software-architect')
    expect(mockContext.invokeAgent.mock.calls[1][0].skill).toBeUndefined()

    const questionsPath = join(productDir, 'QUESTIONS.json')
    expect(existsSync(questionsPath)).toBe(true)
    const questionsJson = JSON.parse(readFileSync(questionsPath, 'utf-8'))
    expect(questionsJson).toHaveLength(1)
    expect(questionsJson[0].question).toBe('Q1')

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('includes RefinementHandler in ChainBuilder.buildDefault()', () => {
    const chain = ChainBuilder.buildDefault()
    expect(chain).toBeDefined()
  })

  it('references SCOPE.md in both prompts when an always-inline scope exceeds FORCE_INLINE_MAX', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const workingDir = mkdtempSync(join(tmpdir(), 'refinement-scope-test-'))
    mockContext.workingDir = workingDir
    mockContext.config.productDir = join(workingDir, 'docs', 'product')
    const scope = 'a'.repeat(FORCE_INLINE_MAX + 1)
    mockFsm.loadScope.mockReturnValue(scope)

    await handler.handle(Phase.REFINEMENT, mockContext)

    const prompts = mockContext.invokeAgent.mock.calls.map((call: any[]) => call[0].prompt as string)
    expect(prompts).toHaveLength(2)
    for (const prompt of prompts) {
      expect(prompt).toContain('<scope_ref>')
      expect(prompt).toContain(`Read file: \`${join(mockContext.config.productDir, 'SCOPE.md')}\``)
      expect(prompt).not.toContain('<scope>')
    }

    rmSync(workingDir, { recursive: true, force: true })
  })
})
