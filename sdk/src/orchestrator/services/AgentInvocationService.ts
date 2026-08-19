import { createInterface } from 'node:readline'
import type { IAgentRunner } from '../../agent-runner/IAgentRunner'
import type { AgentInvocation, AgentOutput } from '../../agent-runner/types'
import { Phase } from '../types'
import type { OrchestratorConfig } from '../types'
import { AgentRunnerError, AgentRunnerErrorCode } from '../../agent-runner/AgentRunnerError'
import type { HarnessSettings } from '../../settings/HarnessSettings'
import type { TokenLedger } from '../../telemetry/TokenLedger'
import type { ISessionLedger } from '../../diagnose/types'
import { DEFAULT_PHASE_TIMEOUT_MS, DEFAULT_WAIT_TIMEOUT_MS } from '../../settings/DefaultSettings'
import { OrchestratorFormatter } from '../utils/OrchestratorFormatter'
import { TerminalProgress } from '../../ui/TerminalProgress'
import { AnsiHelpers } from '../../ui/AnsiHelpers'
import { DebugContext } from '../../cli/DebugContext'

export class AgentInvocationService {
  constructor(
    private readonly agentRunner: IAgentRunner,
    private readonly ledger: TokenLedger,
    private readonly diagnoseLedger?: ISessionLedger
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
    const phaseKey = invocation.phaseKey?.toLowerCase()

    let timeoutMs = config.timeoutMs
    if (timeoutMs === undefined && settingKey) {
      timeoutMs = settings.getTimeoutMs(settingKey, phaseKey)
    }
    if (timeoutMs === undefined) {
      timeoutMs = DEFAULT_PHASE_TIMEOUT_MS
    }

    // Replace model if defined in settings for current phase
    let finalInvocation = {
      ...invocation,
      timeoutMs: timeoutMs
    }

    if (settingKey && phaseKey) {
      const overrides = settings.resolve(settingKey, phaseKey)
      if (overrides.model || overrides.effort) {
        finalInvocation = {
          ...finalInvocation,
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

    const agentLabel = finalInvocation.agent

    if (DebugContext.enabled) {
      process.stderr.write(
        `[DEBUG] invokeAgent: agent=${finalInvocation.agent}` +
        `, skill=${finalInvocation.skill ?? ''}` +
        `, model=${finalInvocation.model ?? 'default'}` +
        `, effort=${finalInvocation.effort ?? 'default'}` +
        `, timeoutMs=${finalInvocation.timeoutMs}\n\n`
      )
      if (finalInvocation.additionalDirs?.length) {
        process.stderr.write(`[DEBUG] additionalDirs: [${finalInvocation.additionalDirs.join(', ')}]\n\n`)
      }
    }

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

          let resolved = false
          const promptTimeoutId = setTimeout(() => {
            if (resolved) return
            resolved = true
            rl.close()
            console.error(`\n  ${AnsiHelpers.red('✖')} Tempo limite esgotado (60s). Encerrando agente automaticamente.`)
            resolve('E')
          }, DEFAULT_WAIT_TIMEOUT_MS)

          rl.question(`  ${AnsiHelpers.dim('Escolha [C/E] (60s para auto-encerrar):')} `, ans => {
            if (resolved) return
            resolved = true
            clearTimeout(promptTimeoutId)
            rl.close()
            resolve(ans.trim().toUpperCase())
          })
        })

        if (cancelled || controller.signal.aborted) return

        if (answer === 'E') {
          console.error(`\n  ${AnsiHelpers.red('✖')} Agente abortado.\n`)
          controller.abort()
          return
        }

        // Any other key (including 'C' or Enter) → extend
        console.error(`\n  ${AnsiHelpers.green('✔')} Timeout renovado. Aguardando agente...\n`)
        TerminalProgress.startSpinner(currentPhase, `Running agent: ${agentLabel}`)
        cancel = scheduleTimeout(elapsedMs + timeoutMs!)
      }, timeoutMs!)

      cancel = () => {
        cancelled = true
        clearTimeout(timer)
      }

      return () => cancel()
    }

    TerminalProgress.startSpinner(currentPhase, `Running agent: ${agentLabel}`)

    const startTime = Date.now()
    let cancelTimeout = scheduleTimeout(0)
    try {
      const output = await this.agentRunner.run(finalInvocation, { signal: controller.signal })
      if (this.diagnoseLedger) {
        try {
          const sessionId = output.session?.id ?? `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          const isDevOrReview = currentPhase === Phase.DEVELOPMENT || currentPhase === Phase.REVIEW
          const domain = finalInvocation.domain ?? (finalInvocation.payload as any)?.domain
          this.diagnoseLedger.append({
            sessionId,
            runner: runnerType,
            agent: finalInvocation.agent,
            skill: finalInvocation.skill,
            model: output.usage?.model ?? finalInvocation.model,
            effort: output.usage?.effort ?? finalInvocation.effort,
            featureId: (finalInvocation.payload as any)?.featureId,
            phase: currentPhase,
            ...(isDevOrReview ? {
              domain: domain || undefined,
            } : {}),
            durationMs: Date.now() - startTime,
            status: 'pending',
            timestamp: new Date().toISOString(),
          })
        } catch {
          // ignore diagnose recording errors to prevent failing agent execution
        }
      }

      if (output.usage) {
        this.ledger.record(finalInvocation.skill ?? '', finalInvocation.agent, output.usage)
        const elapsedMs = Date.now() - startTime
        const durationStr = OrchestratorFormatter.formatDuration(elapsedMs)
        const { inputTokens, outputTokens } = output.usage
        const total = inputTokens + outputTokens
        const domain = finalInvocation.domain ?? (finalInvocation.payload as any)?.domain
        console.log(
          `\n  ${AnsiHelpers.green('✔')} ${AnsiHelpers.cyan(finalInvocation.agent)} finished in ${AnsiHelpers.yellow(durationStr)}`
        )
        if (domain) {
          console.log(
            `  ${AnsiHelpers.dim('🎯')} ${AnsiHelpers.dim(' Domain:')} ${AnsiHelpers.cyan(domain)}`
          )
        }
        console.log(
          `  ${AnsiHelpers.dim('🪙')} ${AnsiHelpers.dim(' Tokens:')} ` +
          `${AnsiHelpers.cyan(inputTokens.toLocaleString())} prompt | ` +
          `${AnsiHelpers.cyan(outputTokens.toLocaleString())} completion | ` +
          `total: ${AnsiHelpers.yellow(total.toLocaleString())}\n`
        )
      }
      return output
    } catch (err: any) {
      if (controller.signal.aborted) {
        throw new AgentRunnerError({
          code: AgentRunnerErrorCode.TIMEOUT,
          skill: finalInvocation.skill ?? '',
          phase: 'dispatch',
          message: `Agent aborted by user after timeout (agent: ${agentLabel})`,
        })
      }
      throw err
    } finally {
      cancelTimeout()
      TerminalProgress.stopSpinner()
    }
  }
}
