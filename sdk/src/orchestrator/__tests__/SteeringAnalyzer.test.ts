import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SteeringAnalyzer } from '../SteeringAnalyzer'
import type { IAgentRunner } from '../../agent-runner/IAgentRunner'
import type { AgentInvocation, AgentOutput } from '../../agent-runner/types'

describe('SteeringAnalyzer', () => {
  it('parses steering message into SteeringActions successfully', async () => {
    const mockRunner: IAgentRunner = {
      run: vi.fn().mockResolvedValue({
        success: true,
        stdout: '',
        stderr: '',
        raw: '```json\n[{"type": "add_rule", "rule": "Never change index.ts"}]\n```',
      }),
    }

    const actions = await SteeringAnalyzer.analyze('never change index.ts', mockRunner)
    expect(actions).toEqual([{ type: 'add_rule', rule: 'Never change index.ts' }])
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'harness-kit:software-architect',
      })
    )
  })

  it('returns empty array if LLM response is malformed', async () => {
    const mockRunner: IAgentRunner = {
      run: vi.fn().mockResolvedValue({
        success: true,
        stdout: '',
        stderr: '',
        raw: 'sorry, I cannot parse this',
      }),
    }

    const actions = await SteeringAnalyzer.analyze('hello', mockRunner)
    expect(actions).toEqual([])
  })
})
