import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SteeringAnalyzer, type SteeringAction } from '../SteeringAnalyzer'
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

  describe('Validation', () => {
    it('SEC-STEERING: validateActions rejects invalid action types', () => {
      const invalid = [{ type: 'exec_command', command: 'rm -rf /' }] as any[]
      const validated = SteeringAnalyzer.validateActions(invalid)
      expect(validated).toHaveLength(0)
    })

    it('SEC-STEERING: validateActions accepts valid add_rule actions', () => {
      const valid: SteeringAction[] = [{ type: 'add_rule', rule: 'Use Portuguese comments' }]
      const validated = SteeringAnalyzer.validateActions(valid)
      expect(validated).toHaveLength(1)
    })

    it('SEC-STEERING: validateActions rejects add_rule with oversized rule', () => {
      const oversized: SteeringAction[] = [{ type: 'add_rule', rule: 'x'.repeat(5001) }]
      const validated = SteeringAnalyzer.validateActions(oversized)
      expect(validated).toHaveLength(0)
    })

    it('SEC-STEERING: validateActions limits override_score to 0-10 range', () => {
      const actions: SteeringAction[] = [{ type: 'override_score', tl: 100, adv: -5 }]
      const validated = SteeringAnalyzer.validateActions(actions)
      expect(validated).toHaveLength(1)
      const overrideAction = validated[0] as { type: 'override_score'; tl?: number; adv?: number }
      expect(overrideAction.tl).toBe(10)
      expect(overrideAction.adv).toBe(0)
    })

    it('SEC-STEERING: validateActions validates rollback phase names', () => {
      const valid: SteeringAction[] = [{ type: 'rollback', targetPhase: 'PLANNING' }]
      const validated = SteeringAnalyzer.validateActions(valid)
      expect(validated).toHaveLength(1)

      const invalid: SteeringAction[] = [{ type: 'rollback', targetPhase: 'EXEC_SHELL' }]
      const invalidResult = SteeringAnalyzer.validateActions(invalid)
      expect(invalidResult).toHaveLength(0)
    })
  })
})
