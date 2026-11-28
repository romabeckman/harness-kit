import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RefinementHandler } from '../../../src/orchestrator/phases/RefinementHandler'
import { Phase } from '../../../src/orchestrator/types'
import { FileStateManager } from '../../../src/file-state/FileStateManager'
// @ts-ignore
import { input } from '@inquirer/prompts'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeQuestionsForPrompt, writeRefinementForPrompt } from '../../fixtures/pbb-refinement'

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  editor: vi.fn(),
}))

describe('RefinementHandler', () => {
  let handler: RefinementHandler
  let mockContext: any
  let workingDir: string

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new RefinementHandler()
    workingDir = mkdtempSync(join(tmpdir(), 'refinement-answers-'))
    const questions = [
      { id: 1, question: 'Question 1?', recommendation: 'Rec 1', context: 'Ctx 1' },
    ]

    mockContext = {
      workingDir,
      config: { enableRefinement: true, scope: 'Test scope' },
      fsm: new FileStateManager({ productDir: join(workingDir, 'docs', 'product') }),
      invokeAgent: vi.fn().mockImplementation(async ({ phaseKey, prompt }) => {
        if (phaseKey === 'refinement_questions') {
          writeQuestionsForPrompt(prompt, prompt.includes('<follow_up>') ? [] : questions)
        } else {
          writeRefinementForPrompt(prompt)
        }
      }),
    }
  })

  afterEach(() => {
    rmSync(workingDir, { recursive: true, force: true })
  })

  it('should ask generated questions and the optional "Any additional information?" question at the end', async () => {
    vi.mocked(input)
      .mockResolvedValueOnce('Answer 1') // For Question 1
      .mockResolvedValueOnce('Additional info text') // For "Any additional information?"

    const nextPhase = await handler.handle(Phase.REFINEMENT, mockContext)

    expect(nextPhase).toBe(Phase.BOOTSTRAP)
    expect(input).toHaveBeenCalledTimes(2)
    expect(input).toHaveBeenNthCalledWith(1, {
      message: ' Your answer (Enter to accept, /defer or /unknown):',
      default: 'Rec 1',
    })
    expect(input).toHaveBeenNthCalledWith(2, {
      message: ' Any additional information?',
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
