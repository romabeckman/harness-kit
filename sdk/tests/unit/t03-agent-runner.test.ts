import { describe, it, expect } from 'vitest'
import { NullAgentRunner } from '../../src/agent-runner/NullAgentRunner'
import type { IAgentRunner } from '../../src/agent-runner/IAgentRunner'

describe('T03 — IAgentRunner interface + NullAgentRunner', () => {
  it('NullAgentRunner implements IAgentRunner', () => {
    const runner: IAgentRunner = new NullAgentRunner()
    expect(runner).toBeDefined()
  })

  it('NullAgentRunner.run() throws NotImplementedError', async () => {
    const runner = new NullAgentRunner()
    await expect(
      runner.run({ skill: 'test', agent: 'test-agent', mode: 'autonomous', payload: {} })
    ).rejects.toThrow('NotImplementedError')
  })

  it('NullAgentRunner.run() throws with descriptive message', async () => {
    const runner = new NullAgentRunner()
    await expect(
      runner.run({ skill: 'tdd-orchestrator', agent: 'developer-backend', mode: 'autonomous', payload: {} })
    ).rejects.toThrow('tdd-orchestrator')
  })
})
