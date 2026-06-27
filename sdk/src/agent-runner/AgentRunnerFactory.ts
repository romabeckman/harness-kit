import { AgentRunnerRegistry } from './AgentRunnerRegistry'
import type { IAgentRunner } from './IAgentRunner'
import type { RunnerConfig } from './types'

export class AgentRunnerFactory {
  static create(config: RunnerConfig): IAgentRunner {
    if (!config || typeof config.type !== 'string') {
      throw new Error('Invalid runner configuration.')
    }
    const reg = AgentRunnerRegistry.get(config.type)
    if (!reg) {
      throw new Error(`Runner type "${config.type}" not registered.`)
    }
    if (reg.validateConfig) {
      reg.validateConfig(config)
    }
    return new reg.constructor(config)
  }
}
