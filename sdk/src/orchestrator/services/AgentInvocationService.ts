import { createInterface } from 'node:readline'
import type { IAgentRunner } from '../../agent-runner/IAgentRunner'
import type { AgentInvocation, AgentOutput } from '../../agent-runner/types'
import { Phase } from '../types'
import type { OrchestratorConfig } from '../types'
import type { HarnessSettings } from '../../settings/HarnessSettings'
import type { TokenLedger } from '../../telemetry/TokenLedger'
import { DEFAULT_PHASE_TIMEOUT_MS } from '../../settings/DefaultSettings'
import { OrchestratorFormatter } from '../utils/OrchestratorFormatter'
import { TerminalProgress } from '../../ui/TerminalProgress'
import { AnsiHelpers } from '../../ui/AnsiHelpers'

export class AgentInvocationService {
  constructor(
    private readonly agentRunner: IAgentRunner,
    private readonly ledger: TokenLedger
  ) { }

  async invokeAgent(
    invocation: AgentInvocation,
    currentPhase: Phase,
    config: OrchestratorConfig,
    settings: HarnessSettings
  ): Promise<AgentOutput> {
    const controller = new AbortController()

    const runnerType = this.agentRunner.type ?? ''
    const settingKey = settings.hasSettings(runnerType) ? runnerType : runnerType.split('-')[0]
    const phaseKey = invocation.phaseKey ?? (() => {
      switch (currentPhase) {
        case Phase.BOOTSTRAP: return 'bootstrap'
        case Phase.PHASE_A: return 'phase_a'
        case Phase.PHASE_B: return 'phase_b'
        case Phase.PHASE_C: return 'phase_c_tl'
        case Phase.PHASE_E: return 'phase_e'
        default: return ''
      }
    })()

    let timeoutMs = config.timeoutMs
    if (timeoutMs === undefined && settingKey) {
      timeoutMs = settings.getTimeoutMs(settingKey, phaseKey)
    }
    if (timeoutMs === undefined) {
      timeoutMs = DEFAULT_PHASE_TIMEOUT_MS
    }

    // Replace model if defined in settings for current phase
    let finalInvocation = invocation
    if (settingKey && phaseKey) {
      const overrides = settings.resolve(settingKey, phaseKey)
      if (overrides.model || overrides.effort) {
        finalInvocation = {
          ...invocation,
          model: overrides.model ?? invocation.model,
          effort: overrides.effort ?? invocation.effort,
        }
      }
    }

    if (config.projectPaths?.length) {
      finalInvocation = {
        ...finalInvocation,
        additionalDirs: [
          ...(finalInvocation.additionalDirs ?? []),
          ...config.projectPaths,
        ],
      }
    }

    const phaseDesc = OrchestratorFormatter.getPhaseDescription(currentPhase)
    const agentLabel = finalInvocation.agent

    /**
     * Schedules a timeout that, when it fires, stops the spinner and asks the
     * user interactively whether to extend the timeout or abort the agent.
     * Choosing "continue" restarts a fresh timeout with the same duration.
     * Choosing "abort" calls controller.abort() to kill the child process.
     *
     * @param elapsedMs - total elapsed time so far (for display only)
     * @returns a cancel function that clears the pending timer
     */
    const scheduleTimeout = (elapsedMs: number): (() => void) => {
      if (timeoutMs! <= 0) return () => { /* no-op: timeout disabled */ }

      let cancelled = false
      let cancel: () => void = () => { cancelled = true }

      const timer = setTimeout(async () => {
        if (cancelled || controller.signal.aborted) return

        TerminalProgress.stopSpinner()

        const elapsedStr = OrchestratorFormatter.formatDuration(elapsedMs + timeoutMs!)
        console.error(
          `\n  ${AnsiHelpers.yellow('⏱')}  ${AnsiHelpers.yellow(`Timeout atingido após ${elapsedStr}`)} ` +
          `${AnsiHelpers.dim(`(agent: ${agentLabel})`)}`
        )
        console.error(`  ${AnsiHelpers.dim('O agente ainda pode estar trabalhando.')}\n`)

        // Check if environment is interactive and not in test environment
        const isInteractive = process.stdout.isTTY && process.stdin.isTTY && process.env.NODE_ENV !== 'test'
        if (!isInteractive) {
          // Non-interactive/test environments should abort automatically to avoid hanging
          controller.abort()
          return
        }

        console.error(`  ${AnsiHelpers.cyan('[C]')} Continuar por mais ${OrchestratorFormatter.formatDuration(timeoutMs!)}`)
        console.error(`  ${AnsiHelpers.red('[E]')} Encerrar e abortar o agente\n`)

        const answer = await new Promise<string>(resolve => {
          const rl = createInterface({ input: process.stdin, output: process.stderr })
          rl.question(`  ${AnsiHelpers.dim('Escolha [C/E]:')} `, ans => {
            rl.close()
            resolve(ans.trim().toUpperCase())
          })
        })

        if (cancelled || controller.signal.aborted) return

        if (answer === 'E') {
          console.error(`\n  ${AnsiHelpers.red('✖')} Agente abortado pelo usuário.\n`)
          controller.abort()
          return
        }

        // Any other key (including 'C' or Enter) → extend
        console.error(`\n  ${AnsiHelpers.green('✔')} Timeout renovado. Aguardando agente...\n`)
        TerminalProgress.startSpinner(phaseDesc, `Running agent: ${agentLabel}`)
        cancel = scheduleTimeout(elapsedMs + timeoutMs!)
      }, timeoutMs!)

      cancel = () => {
        cancelled = true
        clearTimeout(timer)
      }

      return () => cancel()
    }

    TerminalProgress.startSpinner(phaseDesc, `Running agent: ${agentLabel}`)

    const startTime = Date.now()
    let cancelTimeout = scheduleTimeout(0)
    try {
      const output = await this.agentRunner.run(finalInvocation, { signal: controller.signal })
      if (output.usage) {
        this.ledger.record(finalInvocation.skill ?? 'unknown', finalInvocation.agent, output.usage)
        const elapsedMs = Date.now() - startTime
        const durationStr = OrchestratorFormatter.formatDuration(elapsedMs)
        const { inputTokens, outputTokens } = output.usage
        const total = inputTokens + outputTokens
        console.log(
          `\n  ${AnsiHelpers.green('✔')} ${AnsiHelpers.cyan(finalInvocation.agent)} finished in ${AnsiHelpers.yellow(durationStr)}`
        )
        console.log(
          `  ${AnsiHelpers.dim('🪙')} ${AnsiHelpers.dim(' Tokens:')} ` +
          `${AnsiHelpers.cyan(inputTokens.toLocaleString())} prompt | ` +
          `${AnsiHelpers.cyan(outputTokens.toLocaleString())} completion | ` +
          `total: ${AnsiHelpers.yellow(total.toLocaleString())}\n`
        )
      }
      return output
    } finally {
      cancelTimeout()
      TerminalProgress.stopSpinner()
    }
  }
}
