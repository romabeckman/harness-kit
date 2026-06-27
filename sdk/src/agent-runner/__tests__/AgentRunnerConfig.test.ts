import { describe, it, expect } from 'vitest'
import { DEFAULT_AGENT_RUNNER_CONFIG } from '../claude-agent/AgentRunnerConfig'
import type { AgentRunnerConfig } from '../claude-agent/AgentRunnerConfig'

describe('AgentRunnerConfig', () => {
  describe('DEFAULT_AGENT_RUNNER_CONFIG', () => {
    it('has model set to claude-sonnet-4-6', () => {
      expect(DEFAULT_AGENT_RUNNER_CONFIG.model).toBe('claude-sonnet-4-6')
    })

    it('has timeoutMs set to 300000', () => {
      expect(DEFAULT_AGENT_RUNNER_CONFIG.timeoutMs).toBe(300_000)
    })

    it('is frozen — mutation throws in strict mode', () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (DEFAULT_AGENT_RUNNER_CONFIG as any).model = 'mutated'
      }).toThrow()
    })

    it('satisfies the AgentRunnerConfig interface shape', () => {
      const config: AgentRunnerConfig = DEFAULT_AGENT_RUNNER_CONFIG
      expect(typeof config.model).toBe('string')
      expect(typeof config.timeoutMs).toBe('number')
    })
  })
})
