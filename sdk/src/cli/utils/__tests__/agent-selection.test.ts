import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Runner } from '../../../agent-runner/types'
import { selectAgentRunner } from '../agent-selection'

const prompts = vi.hoisted(() => ({ select: vi.fn() }))

vi.mock('@inquirer/prompts', () => prompts)

describe('selectAgentRunner', () => {
  beforeEach(() => prompts.select.mockReset())

  it('returns an explicit agent without prompting', async () => {
    await expect(selectAgentRunner('codex-cli')).resolves.toBe('codex-cli')
    expect(prompts.select).not.toHaveBeenCalled()
  })

  it('prompts from built-in runner choices when agent flag is absent', async () => {
    prompts.select.mockResolvedValueOnce('copilot-cli')

    await expect(selectAgentRunner()).resolves.toBe('copilot-cli')

    expect(prompts.select).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Select agent runner:',
      default: Runner.CLAUDE_CLI,
      choices: expect.arrayContaining([
        expect.objectContaining({ name: Runner.CLAUDE_CLI, value: Runner.CLAUDE_CLI }),
        expect.objectContaining({ name: Runner.COPILOT_CLI, value: Runner.COPILOT_CLI }),
      ]),
    }))
  })
})
