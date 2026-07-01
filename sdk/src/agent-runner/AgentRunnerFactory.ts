import { AgentRunnerRegistry } from './AgentRunnerRegistry'
import type { IAgentRunner } from './IAgentRunner'
import type { RunnerConfig } from './types'

// Force load all built-in runner strategies to trigger self-registration
import './claude-cli/ClaudeCLIRunner'
import './claude-sdk/ClaudeSdkRunner'
import './antigravity-cli/AntigravityCLIRunner'
import './copilot/CopilotRunner'
import './cursor/CursorRunner'

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
