import { Runner } from '../../agent-runner/types'

export interface AgentRunnerChoice {
  name: string
  value: string
}

export interface AgentRunnerSelectionOptions {
  choices?: AgentRunnerChoice[]
}

export const AGENT_RUNNER_CHOICES: AgentRunnerChoice[] = Object.values(Runner).map((runner) => ({
  name: runner,
  value: runner,
}))

export const INTERACTIVE_CANDIDATE_RUNNER_CHOICES: AgentRunnerChoice[] = [
  Runner.ANTIGRAVITY_CLI,
  Runner.CLAUDE_CLI,
  Runner.CODEX_CLI,
  Runner.COPILOT_CLI,
  Runner.CURSOR_CLI,
  Runner.KIRO_CLI,
].map((runner) => ({ name: runner, value: runner }))

export async function selectAgentRunner(
  agentType?: string,
  options: AgentRunnerSelectionOptions = {},
): Promise<string> {
  if (agentType) return agentType

  const { select } = await import('@inquirer/prompts')
  return select({
    message: 'Select agent runner:',
    choices: options.choices ?? AGENT_RUNNER_CHOICES,
    default: Runner.CLAUDE_CLI,
  })
}
