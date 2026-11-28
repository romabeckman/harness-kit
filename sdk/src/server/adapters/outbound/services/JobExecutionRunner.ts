import type { IAgentRunner } from '../../../../agent-runner/IAgentRunner'
import type { AgentInvocation, AgentOutput } from '../../../../agent-runner/types'

const DREAMING_TIMEOUT_MS = 120_000
const JOB_PHASES: Partial<Record<string, string>> = {
  bootstrap: 'BOOTSTRAP',
  bootstrap_project_memory: 'BOOTSTRAP',
  planning: 'PLANNING',
  implementation: 'DEVELOPMENT',
  review_tl: 'REVIEW',
  review_adv: 'REVIEW',
  memory: 'MEMORY',
}

export class JobExecutionError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options)
  }
}

export class JobExecutionRunner implements IAgentRunner {
  memoryFailure?: JobExecutionError

  constructor(
    private readonly runner: IAgentRunner,
    private readonly onProgress: (phase: string) => Promise<void>,
  ) {}

  get type() { return this.runner.type }
  get writePromptToStdin() { return this.runner.writePromptToStdin }

  async run(invocation: AgentInvocation, options?: { signal?: AbortSignal }): Promise<AgentOutput> {
    if (invocation.skill === 'harness-kit:project-dreaming') {
      await this.onProgress('PROJECT_DREAMING')
      const configuredTimeout = invocation.timeoutMs ?? 0
      const timeoutMs = configuredTimeout > 0 ? Math.min(Math.ceil(configuredTimeout), DREAMING_TIMEOUT_MS) : DREAMING_TIMEOUT_MS
      const deadline = AbortSignal.timeout(timeoutMs)
      const signal = options?.signal ? AbortSignal.any([options.signal, deadline]) : deadline
      try {
        const result = await this.runner.run({ ...invocation, timeoutMs }, { signal })
        if (signal.aborted) throw signal.reason
        return result
      } finally {
        await this.onProgress('REVIEW')
      }
    }

    const phase = invocation.phaseKey && JOB_PHASES[invocation.phaseKey]
    if (phase) await this.onProgress(phase)
    if (phase === 'MEMORY') {
      try {
        const result = await this.runner.run(invocation, options)
        if (result.success === false || options?.signal?.aborted) throw new Error('Project memory did not finish successfully.')
        return result
      } catch (cause) {
        this.memoryFailure = new JobExecutionError('MEMORY_FAILED', 'Project memory failed. Resume this job to retry before deployment.', { cause })
        throw this.memoryFailure
      }
    }

    return this.runner.run(invocation, options)
  }
}
