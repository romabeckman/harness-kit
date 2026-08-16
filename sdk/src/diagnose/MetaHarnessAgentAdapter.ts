import { AgentRunnerFactory } from '../agent-runner/AgentRunnerFactory'
import type { IAgentRunner } from '../agent-runner/IAgentRunner'
import type { AgentInvocation, AgentOutput } from '../agent-runner/types'
import { Runner } from '../agent-runner/types'
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
    const model = (settings?.model && settings.model.trim().length > 0) ? settings.model.trim() : (session.model || undefined)
    const effort = (settings?.effort && settings.effort.trim().length > 0) ? settings.effort.trim() : (session.effort || undefined)

    const runner = this.customRunner ?? AgentRunnerFactory.create({
      type: session.runner,
      model,
      effort,
    })

    const prompt = [
      `You are \`harness-kit:meta-harness-agent\`. Execute the trace and evaluation lifecycle for this session:`,
      ``,
      `1. Invoke \`harness-kit:harness-tracer\` to record the execution trace for this session in \`docs/harness-history/traces/${preComputedId}/\`.`,
      `   - Use pre-computed session_id: ${preComputedId}`,
      `   - Skill: ${session.skill ?? 'unknown'}`,
      `   - Agent: ${session.agent}`,
      `   - Model: ${model || 'default'}`,
      `   - Effort: ${effort || 'default'}`,
      ``,
      `2. Evaluate activation rules:`,
      `   - Check trace count in \`docs/harness-history/traces/\`. If count is a positive multiple of 6 (6, 12, 18, ...), invoke \`harness-kit:harness-evaluator\` to update \`pareto-frontier.md\`.`,
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

  async invokeMetaHarness(
    session: DiagnoseSessionRecord,
    settings?: DiagnoseSettings
  ): Promise<AgentOutput> {
    const model = (settings?.model && settings.model.trim().length > 0) ? settings.model.trim() : (session.model || undefined)
    const effort = (settings?.effort && settings.effort.trim().length > 0) ? settings.effort.trim() : (session.effort || undefined)

    const runner = this.customRunner ?? AgentRunnerFactory.create({
      type: session.runner,
      model,
      effort,
    })

    const prompt = [
      `You are \`harness-kit:meta-harness-agent\`.`,
      `All execution sessions have been traced in \`docs/harness-history/traces/\`.`,
      ``,
      `Execute \`harness-kit:meta-harness\` optimization workflow:`,
      `1. Read the trace history and verify that \`docs/harness-history/pareto-frontier.md\` is compiled (invoke \`harness-kit:harness-evaluator\` if needed).`,
      `2. Diagnose patterns of regression, failure modes, or stagnation across skills.`,
      `3. Create the candidate directory in \`docs/harness-history/candidates/{candidate_id}/\` (e.g. \`v001\`, \`v002\`, etc.).`,
      `4. Write the proposed candidate modification to the target skill's \`SKILL.md\` and store the candidate metadata in \`docs/harness-history/candidates/{candidate_id}/\`.`,
    ].join('\n')

    const invocation: AgentInvocation = {
      agent: 'harness-kit:meta-harness-agent',
      skill: 'harness-kit:meta-harness',
      mode: 'autonomous',
      prompt,
      workspacePath: this.workingDir,
      model,
      effort,
      phaseKey: 'diagnose',
    }

    return runner.run(invocation)
  }
}
