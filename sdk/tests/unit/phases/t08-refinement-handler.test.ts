import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RefinementHandler } from '../../../src/orchestrator/phases/RefinementHandler'
import { Phase } from '../../../src/orchestrator/types'
// @ts-ignore
import { input } from '@inquirer/prompts'

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { refinementForPrompt } from '../../fixtures/pbb-refinement'

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
}))

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdtempSync: vi.fn().mockReturnValue('/mock/staged'),
  rmSync: vi.fn(),
}))

describe('RefinementHandler', () => {
  let handler: RefinementHandler
  let mockContext: any

  beforeEach(async () => {
    vi.clearAllMocks()
    handler = new RefinementHandler()
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs')

    const questionsJson = JSON.stringify([
      { id: 1, question: 'Question 1?', recommendation: 'Rec 1', context: 'Ctx 1' },
    ])

    const contract = actualFs.readFileSync(resolve(__dirname, '../../../../skills/pbb-design/references/output-contract.md'), 'utf8')
    vi.mocked(existsSync).mockImplementation(path => !String(path).includes('staged'))
    vi.mocked(readFileSync).mockImplementation((path) => {
      if (String(path).includes('orchestrator') && String(path).includes('prompts')) {
        return actualFs.readFileSync(path, 'utf8')
      }
      return questionsJson
    })

    mockContext = {
      workingDir: '/mock/dir',
      config: { enableRefinement: true, scope: 'Test scope' },
      fsm: {
        existRefinement: vi.fn().mockReturnValue(false),
        saveRefinement: vi.fn(),
        existScope: vi.fn().mockReturnValue(false),
        loadScope: vi.fn().mockReturnValue('Test scope'),
      },
      invokeAgent: vi.fn().mockImplementation(async (opts: any) => {
        if (opts.prompt.includes('raw JSON array')) {
          return {
            raw: questionsJson,
          }
        }
        return { raw: refinementForPrompt(opts.prompt, contract) }
      }),
    }
  })

  it('should ask generated questions and the optional "Any additional information?" question at the end', async () => {
    vi.mocked(input)
      .mockResolvedValueOnce('Answer 1') // For Question 1
      .mockResolvedValueOnce('Additional info text') // For "Any additional information?"

    const nextPhase = await handler.handle(Phase.REFINEMENT, mockContext)

    expect(nextPhase).toBe(Phase.BOOTSTRAP)
    expect(input).toHaveBeenCalledTimes(2)
    expect(input).toHaveBeenNthCalledWith(1, {
      message: 'Your answer (Enter to accept, /defer or /unknown):',
      default: 'Rec 1',
    })
    expect(input).toHaveBeenNthCalledWith(2, {
      message: 'Any additional information?',
      default: '',
    })

    // Verify consolidateRefinement received both Q&A pairs including the additional question
    expect(mockContext.invokeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'harness-kit:cto',
        skill: 'harness-kit:pbb-design',
        prompt: expect.stringContaining('Any additional information?'),
      })
    )
  })

  it('should not add optional question to Q&A record if answer is empty', async () => {
    vi.mocked(input)
      .mockResolvedValueOnce('Answer 1') // For Question 1
      .mockResolvedValueOnce('   ') // Blank answer for optional question

    await handler.handle(Phase.REFINEMENT, mockContext)

    expect(input).toHaveBeenCalledTimes(2)
    expect(mockContext.invokeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'harness-kit:cto',
        skill: 'harness-kit:pbb-design',
        prompt: expect.not.stringContaining('Any additional information?'),
      })
    )
  })
})
