import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RefinementHandler } from '../../../src/orchestrator/phases/RefinementHandler'
import { Phase } from '../../../src/orchestrator/types'
// @ts-ignore
import { input } from '@inquirer/prompts'

import { existsSync, readFileSync } from 'node:fs'

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
}))

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}))

describe('RefinementHandler', () => {
  let handler: RefinementHandler
  let mockContext: any

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new RefinementHandler()

    const questionsJson = JSON.stringify([
      { id: 1, question: 'Question 1?', recommendation: 'Rec 1', context: 'Ctx 1' },
    ])

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(questionsJson)

    mockContext = {
      workingDir: '/mock/dir',
      config: { enableRefinement: true, scope: 'Test scope' },
      fsm: {
        existRefinement: vi.fn().mockReturnValue(false),
        existScope: vi.fn().mockReturnValue(false),
        loadScope: vi.fn().mockReturnValue('Test scope'),
      },
      invokeAgent: vi.fn().mockImplementation(async (opts: any) => {
        if (opts.prompt.includes('raw JSON array')) {
          return {
            raw: questionsJson,
          }
        }
        return { raw: 'consolidated' }
      }),
    }
  })

  it('should ask generated questions and the optional "Any additional information?" question at the end', async () => {
    vi.mocked(input)
      .mockResolvedValueOnce('Answer 1') // For Question 1
      .mockResolvedValueOnce('Additional info text') // For "Any additional information?"

    const nextPhase = await handler.handle(Phase.REFINEMENT, mockContext)

    expect(nextPhase).toBe(Phase.PLANNING)
    expect(input).toHaveBeenCalledTimes(2)
    expect(input).toHaveBeenNthCalledWith(1, {
      message: 'Your answer (Enter to accept recommendation):',
      default: 'Rec 1',
    })
    expect(input).toHaveBeenNthCalledWith(2, {
      message: 'Any additional information?',
      default: '',
    })

    // Verify consolidateRefinement received both Q&A pairs including the additional question
    expect(mockContext.invokeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'harness-kit:software-architect',
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
        agent: 'harness-kit:software-architect',
        prompt: expect.not.stringContaining('Any additional information?'),
      })
    )
  })
})
