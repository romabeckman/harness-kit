import { AgentRunnerFactory } from '../agent-runner/AgentRunnerFactory'
import type { IAgentRunner } from '../agent-runner/IAgentRunner'
import type { AgentInvocation, AgentOutput } from '../agent-runner/types'
import type { DiagnoseSessionRecord, DiagnoseSettings, IMetaHarnessAgentAdapter } from './types'

export interface MetaHarnessAgentAdapterOptions {
  agentRunner?: IAgentRunner
  workingDir?: string
}

export class MetaHarnessAgentAdapter implements IMetaHarnessAgentAdapter {
  private readonly customRunner?: IAgentRunner
  private readonly workingDir: string

  constructor(options: MetaHarnessAgentAdapterOptions = {}) {
    this.customRunner = options.agentRunner
    this.workingDir = options.workingDir ?? process.cwd()
  }

  async invoke(
    session: DiagnoseSessionRecord,
    preComputedId: string,
    settings?: DiagnoseSettings
  ): Promise<AgentOutput> {
    const model = settings?.model ?? session.model
    const effort = settings?.effort ?? session.effort

    const runner = this.customRunner ?? AgentRunnerFactory.create({
      type: session.runner,
      model,
      effort,
    })

    const prompt = [
      `You are \`harness-kit:meta-harness-agent\`. Execute the harness optimization lifecycle for this session:`,
      ``,
      `1. Invoke \`harness-kit:harness-tracer\` to record the execution trace for this session in \`docs/harness-history/traces/${preComputedId}/\`.`,
      `   - Use pre-computed session_id: ${preComputedId}`,
      `   - Skill: ${session.skill ?? 'unknown'}`,
      `   - Agent: ${session.agent}`,
      `   - Model: ${model || 'default'}`,
      `   - Effort: ${effort || 'default'}`,
      ``,
      `2. Evaluate activation rules:`,
      `   - Check trace count in \`docs/harness-history/traces/\`. If count is a positive multiple of 5, invoke \`harness-kit:harness-evaluator\` to update \`pareto-frontier.md\`.`,
      `   - If failure patterns, inefficiencies, or optimization opportunities are diagnosed, invoke \`harness-kit:meta-harness\` to propose candidate skill improvements.`,
    ].join('\n')

    const invocation: AgentInvocation = {
      agent: 'harness-kit:meta-harness-agent',
      mode: 'autonomous',
      prompt,
      workspacePath: this.workingDir,
      model,
      effort,
      phaseKey: 'diagnose',
      session: { id: session.sessionId },
    }

    return runner.run(invocation)
  }
}
