import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { Phase } from './types'
import type { OrchestratorConfig, OrchestratorState, OnDiskState } from './types'
import { ReentryResolver } from './ReentryResolver'
import { FileStateManager } from '../file-state/FileStateManager'
import type { IFileStateManager } from '../file-state/FileStateManager'
import { HarnessSettings } from '../settings/HarnessSettings'
import type { Feature, Task } from '../file-state/types'
import { createDefaultSteeringRules } from '../file-state/types'
import { AgentRunnerFactory } from '../agent-runner/AgentRunnerFactory'
import { AgentRunnerError, AgentRunnerErrorCode } from '../agent-runner/AgentRunnerError'
import { TokenLedger } from '../telemetry/TokenLedger'
import { AnsiHelpers } from '../ui/AnsiHelpers'
import { TerminalProgress } from '../ui/TerminalProgress'
import {
  IPhaseHandler,
  PhaseContext,
  BootstrapHandler,
  PhaseAHandler,
  PhaseBHandler,
  PhaseCHandler,
  PhaseDHandler,
  PhaseEHandler,
  PhaseFHandler,
  CascadeBlockedHandler
} from './phases'

export interface HarnessOrchestratorOptions {
  workingDir?: string
}

export class HarnessOrchestrator implements PhaseContext {
  readonly config: OrchestratorConfig
  readonly workingDir: string
  readonly fsm: IFileStateManager
  state: OrchestratorState
  private readonly agentRunner: import('../agent-runner/IAgentRunner').IAgentRunner
  private readonly ledger: TokenLedger
  private readonly chain: IPhaseHandler
  private readonly settings: HarnessSettings

  constructor(config: OrchestratorConfig, options: HarnessOrchestratorOptions = {}) {
    this.agentRunner = config.agentRunner
      ?? (process.env.ANTHROPIC_API_KEY
        ? AgentRunnerFactory.create({ type: 'claude-agent' })
        : AgentRunnerFactory.create({ type: 'claude-code' }))
    this.config = config
    this.workingDir = options.workingDir ?? process.cwd()
    this.settings = config.settings ?? HarnessSettings.load(this.workingDir)
    const productDir = config.productDir ?? join(this.workingDir, 'docs', 'product')
    this.fsm = new FileStateManager({
      productDir,
      workingDir: this.workingDir,
    })
    // When user resumes execution, we need to use the same scope as the original execution
    if (!this.config.scope) {
      try {
        const bootConfig = this.fsm.loadBootstrapConfig()
        if (bootConfig.originalScope) {
          this.config.scope = bootConfig.originalScope
        }
      } catch {
        // ignore
      }
    }
    this.ledger = new TokenLedger(join(productDir, 'tokens.jsonl'))
    // Determine initial phase via re-entry resolver
    const onDisk = this.readOnDiskState()
    const entryPhase = ReentryResolver.resolve(onDisk)
    this.state = {
      currentPhase: entryPhase,
      activeFeatureId: onDisk.config?.activeFeatureId ?? onDisk.activeFeature?.id ?? null,
      completedCycles: onDisk.config?.cycleCounter.completedCycles ?? 0,
    }

    // Construct Chain of Responsibility
    const bootstrap = new BootstrapHandler()
    bootstrap
      .setNext(new PhaseAHandler())
      .setNext(new PhaseBHandler())
      .setNext(new PhaseCHandler())
      .setNext(new PhaseDHandler())
      .setNext(new PhaseEHandler())
      .setNext(new PhaseFHandler())
      .setNext(new CascadeBlockedHandler())
    this.chain = bootstrap
  }

  getState(): OrchestratorState {
    return { ...this.state }
  }

  tokenReport(): void {
    this.ledger.printReport()
  }



  // ─── Public run loop ──────────────────────────────────────────────────────

  async run(): Promise<void> {
    const MAX_ITERATIONS = 500 // guard against infinite loops
    const MAX_PHASE_ITERATIONS = 5
    let iterations = 0
    let consecutivePhaseIterations = 0
    let lastPrintedPhase: Phase | null = null
    let lastPhaseTracker: Phase | null = null

    const shouldContinuePrompt = async (message: string): Promise<boolean> => {
      const isInteractive = process.stdout.isTTY && process.stdin.isTTY && process.env.NODE_ENV !== 'test'
      if (!isInteractive) {
        return false
      }
      try {
        const { confirm } = await import('@inquirer/prompts')
        return await confirm({
          message,
          default: true
        })
      } catch {
        return false
      }
    }

    while (this.state.currentPhase !== Phase.HALTED) {
      if (++iterations > MAX_ITERATIONS) {
        const message = `HarnessOrchestrator: exceeded ${MAX_ITERATIONS} iterations — possible infinite loop at phase ${this.state.currentPhase}. Do you want to continue anyway?`
        if (await shouldContinuePrompt(message)) {
          iterations = 0
        } else {
          throw new Error(`HarnessOrchestrator: exceeded ${MAX_ITERATIONS} iterations — possible infinite loop at phase ${this.state.currentPhase}`)
        }
      }

      if (this.state.currentPhase === lastPhaseTracker) {
        consecutivePhaseIterations++
      } else {
        consecutivePhaseIterations = 0
        lastPhaseTracker = this.state.currentPhase
      }

      if (consecutivePhaseIterations > MAX_PHASE_ITERATIONS) {
        const message = `HarnessOrchestrator: exceeded consecutive iteration limit of ${MAX_PHASE_ITERATIONS} at phase ${this.state.currentPhase} — possible infinite loop. Do you want to continue anyway?`
        if (await shouldContinuePrompt(message)) {
          consecutivePhaseIterations = 0
        } else {
          throw new Error(`HarnessOrchestrator: exceeded consecutive iteration limit of ${MAX_PHASE_ITERATIONS} at phase ${this.state.currentPhase} — possible infinite loop.`)
        }
      }

      if (this.state.currentPhase !== lastPrintedPhase) {
        this.printPipelineHeader(this.state.currentPhase)
        lastPrintedPhase = this.state.currentPhase
      }

      // Persist current phase before executing
      this.persistPhase()

      const phaseStartTime = Date.now()
      let next: Phase
      try {
        next = await this.dispatch(this.state.currentPhase)
      } catch (err) {
        if (err instanceof AgentRunnerError && err.code === AgentRunnerErrorCode.QUOTA_EXCEEDED) {
          process.stderr.write(
            `\n${AnsiHelpers.yellow('⚠')} ${AnsiHelpers.dim('Quota / rate-limit reached.')} ` +
            `Phase ${AnsiHelpers.cyan(this.getPhaseDescription(this.state.currentPhase))} persisted.\n` +
            `  Resume: ${AnsiHelpers.dim('hrns run')} → select "resume"\n\n`
          )
          this.state = { ...this.state, currentPhase: Phase.HALTED }
          return
        }
        throw err
      }

      const elapsedMs = Date.now() - phaseStartTime
      const durationStr = this.formatDuration(elapsedMs)

      if (next !== this.state.currentPhase) {
        const transitionMsg = `Phase transition: ${this.getPhaseDescription(this.state.currentPhase)} → ${this.getPhaseDescription(next)}`
        this.fsm.appendDecision({
          featureId: null,
          decision: transitionMsg
        })
        console.log(`\n${AnsiHelpers.green('✔')} ${AnsiHelpers.cyan(this.getPhaseDescription(this.state.currentPhase))} completed in ${AnsiHelpers.yellow(durationStr)}`)
        console.log(`${AnsiHelpers.blue('⟳')} ${AnsiHelpers.dim('Transitioning to:')} ${AnsiHelpers.cyan(this.getPhaseDescription(next))}`)
      }
      this.state = { ...this.state, currentPhase: next }
    }
  }

  /**
   * Run only BOOTSTRAP phase (for tests).
   */
  async runBootstrapOnly(): Promise<void> {
    if (this.state.currentPhase === Phase.BOOTSTRAP) {
      await this.chain.handle(Phase.BOOTSTRAP, this)
    }
  }

  // ─── Phase dispatch ───────────────────────────────────────────────────────

  private async dispatch(phase: Phase): Promise<Phase> {
    const next = await this.chain.handle(phase, this)
    if (next === null) {
      throw new Error(`Unhandled phase: ${phase}`)
    }
    return next
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  public updateState(state: Partial<OrchestratorState>): void {
    this.state = { ...this.state, ...state }
  }

  // When user resumes execution, we need to apply the steering actions
  // to the steering rules. This function is called from the CLI
  public applySteeringActions(actions: import('./SteeringAnalyzer').SteeringAction[]): void {
    const config = this.fsm.loadBootstrapConfig()
    if (!config.steeringRules) {
      config.steeringRules = createDefaultSteeringRules()
    }
    if (!config.steeringRules.user) {
      config.steeringRules.user = []
    }
    for (const action of actions) {
      if (action.type === 'add_rule') {
        config.steeringRules.user.push(action.rule)
        this.fsm.appendDecision({
          featureId: null,
          decision: `Steering override: Added development rule: "${action.rule}"`
        })
      } else if (action.type === 'rollback') {
        const target = action.targetPhase as Phase
        this.state.currentPhase = target
        config.currentPhase = target
        this.fsm.appendDecision({
          featureId: null,
          decision: `Steering override: State rollback to phase ${target}`
        })
        if (target === Phase.PHASE_B || target === Phase.PHASE_A) {
          const features = this.fsm.loadBacklog()
          const active = this.getActiveFeature(features)
          if (active) {
            const tasks = this.fsm.loadDevelopmentState()
            for (const t of tasks) {
              if (t.featureId === active.id) {
                this.fsm.updateTaskStatus(active.id, t.taskId, '-', 'NOT_STARTED')
              }
            }
          }
        }
      } else if (action.type === 'override_score') {
        const features = this.fsm.loadBacklog()
        const active = this.getActiveFeature(features)
        if (active) {
          this.fsm.updateFeatureStatus(
            active.id,
            active.status,
            {
              tl: action.tl ?? active.scoreTL ?? 100,
              adv: action.adv ?? active.scoreAdv ?? 100
            }
          )
          this.fsm.appendDecision({
            featureId: active.id,
            decision: `Steering override: Manual QA scores set to (TL: ${action.tl}, ADV: ${action.adv})`
          })
        }
      }
    }
    this.fsm.saveBootstrapConfig(config)
  }

  public invokeAgent(invocation: import('../agent-runner/types').AgentInvocation): Promise<import('../agent-runner/types').AgentOutput> {
    return this.invokeAgentInternal(invocation)
  }

  private async invokeAgentInternal(invocation: import('../agent-runner/types').AgentInvocation): Promise<import('../agent-runner/types').AgentOutput> {
    const controller = new AbortController()

    const runnerType = this.agentRunner.type ?? ''
    const phaseKey = invocation.phaseKey ?? (() => {
      switch (this.state.currentPhase) {
        case Phase.BOOTSTRAP: return 'bootstrap'
        case Phase.PHASE_A: return 'phase_a'
        case Phase.PHASE_B: return 'phase_b'
        case Phase.PHASE_C: return 'phase_c_tl'
        case Phase.PHASE_E: return 'phase_e'
        default: return ''
      }
    })()

    let timeoutMs = this.config.timeoutMs
    if (timeoutMs === undefined && runnerType) {
      timeoutMs = this.settings.getTimeoutMs(runnerType, phaseKey)
    }
    if (timeoutMs === undefined) {
      timeoutMs = 300_000
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        controller.abort()
      }, timeoutMs)
    }

    let finalInvocation = invocation
    if (runnerType && phaseKey) {
      const overrides = this.settings.resolve(runnerType, phaseKey)
      if (overrides.model || overrides.effort) {
        finalInvocation = {
          ...invocation,
          model: overrides.model ?? invocation.model,
          effort: overrides.effort ?? invocation.effort,
        }
      }
    }

    TerminalProgress.startSpinner(this.getPhaseDescription(this.state.currentPhase), `Running agent: ${finalInvocation.agent}`)

    const startTime = Date.now()
    try {
      const output = await this.agentRunner.run(finalInvocation, { signal: controller.signal })
      if (output.usage) {
        this.ledger.record(finalInvocation.skill ?? 'unknown', finalInvocation.agent, output.usage)
        const elapsedMs = Date.now() - startTime
        const durationStr = this.formatDuration(elapsedMs)
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
      if (timer) clearTimeout(timer)
      TerminalProgress.stopSpinner()
    }
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) {
      return `${seconds}s`
    }
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  private printPipelineHeader(current: Phase) {
    const phases = [
      Phase.BOOTSTRAP,
      Phase.PHASE_A,
      Phase.PHASE_B,
      Phase.PHASE_C,
      Phase.PHASE_D,
      Phase.PHASE_E,
      Phase.PHASE_F,
    ]
    const shortNames: Record<Phase, string> = {
      [Phase.BOOTSTRAP]: 'BOOT',
      [Phase.PHASE_A]: 'REFINE',
      [Phase.PHASE_B]: 'IMPLEMENT',
      [Phase.PHASE_C]: 'VALIDATE',
      [Phase.PHASE_D]: 'TUNING',
      [Phase.PHASE_E]: 'MEMORY',
      [Phase.PHASE_F]: 'DECIDE',
      [Phase.CASCADE_BLOCKED]: 'BLOCKED',
      [Phase.HALTED]: 'HALTED',
    }

    const currentIndex = phases.indexOf(current)
    const line = phases
      .map((p, idx) => {
        const name = shortNames[p] || p
        if (idx < currentIndex) {
          return AnsiHelpers.green(`✔ ${name}`)
        } else if (idx === currentIndex) {
          return AnsiHelpers.cyan(`● ${name}`)
        } else {
          return AnsiHelpers.dim(`  ${name}`)
        }
      })
      .join(AnsiHelpers.dim(' → '))

    console.log(`\n${AnsiHelpers.blue('──')} ${AnsiHelpers.dim('Pipeline State:')} [${line}] ${AnsiHelpers.blue('──')}\n`)
  }

  public getActiveFeature(features: Feature[]): Feature | null {
    // If we have an activeFeatureId, use it
    if (this.state.activeFeatureId) {
      const found = features.find(f => f.id === this.state.activeFeatureId)
      if (found) return found
    }
    // Otherwise pick first NOT_STARTED or IN_PROGRESS
    return features.find(f => f.status === 'NOT_STARTED' || f.status === 'IN_PROGRESS') ?? null
  }

  public checkSpecFilesPresent(domain: string): boolean {
    const specsDir = join(this.workingDir, 'docs', 'specs', domain)
    return existsSync(specsDir)
  }

  public extractTasksFromTacticalDesign(domain: string): Array<{ taskId: string; description: string }> {
    const specsDir = join(this.workingDir, 'docs', 'specs', domain)
    const files = existsSync(specsDir)
      ? readdirSync(specsDir).filter(f => f.match(/^003-.*tactical-design.*\.md$/i))
      : []

    if (files.length === 0) return []

    const content = readFileSync(join(specsDir, files[0]), 'utf8')

    // Find Section 6
    const section6Match = content.match(/## Section 6[^\n]*\n([\s\S]*?)(?=\n## |$)/i)
    if (!section6Match) return []

    const section = section6Match[1]
    const tasks: Array<{ taskId: string; description: string }> = []

    // Parse Task ID / Description blocks (fenced or plain)
    const taskBlocks = section.split(/(?=Task ID\s*:)/i).filter(b => b.trim())

    for (const block of taskBlocks) {
      const idMatch = block.match(/Task ID\s*:\s*(\S+)/i)
      const descMatch = block.match(/Description\s*:\s*(.+)/i)
      if (idMatch && descMatch) {
        const rawId = idMatch[1].replace(/[^a-zA-Z0-9]/g, '')
        tasks.push({
          taskId: `T${rawId.padStart(2, '0')}`,
          description: descMatch[1].trim(),
        })
      }
    }

    return tasks
  }



  private readOnDiskState(): OnDiskState {
    const productDir = this.config.productDir ?? join(this.workingDir, 'docs', 'product')
    const productFilesExist =
      existsSync(join(productDir, 'BACKLOG.md')) &&
      existsSync(join(productDir, 'DEVELOPMENT-STATE.md')) &&
      existsSync(join(productDir, 'DECISIONS.md')) &&
      existsSync(join(productDir, 'BOOTSTRAP-CONFIG.json'))

    if (!productFilesExist) {
      return {
        productFilesExist: false,
        features: [],
        tasks: [],
        config: null,
        activeFeature: null,
        specFilesPresent: false,
        tddOutputPresent: false,
        allTasksCompleted: false,
      }
    }

    const features = this.fsm.loadBacklog()
    const tasks = this.fsm.loadDevelopmentState()
    const config = this.fsm.loadBootstrapConfig()

    const activeFeature =
      features.find(f => f.status === 'IN_PROGRESS') ??
      features.find(f => f.status === 'NOT_STARTED') ??
      null

    const domain = activeFeature?.domain ?? ''
    const specFilesPresent = domain ? this.checkSpecFilesPresent(domain) : false
    const tddOutputPath = domain
      ? join(this.workingDir, 'docs', 'specs', domain, 'TDD-OUTPUT.json')
      : ''
    const tddOutputPresent = tddOutputPath ? existsSync(tddOutputPath) : false

    const featureTasks = activeFeature
      ? tasks.filter(t => t.featureId === activeFeature.id)
      : []
    const allTasksCompleted =
      featureTasks.length > 0 && featureTasks.every(t => t.status === 'COMPLETED')

    return {
      productFilesExist: true,
      features,
      tasks,
      config,
      activeFeature,
      specFilesPresent,
      tddOutputPresent,
      allTasksCompleted,
    }
  }

  private persistPhase(): void {
    try {
      const config = this.fsm.loadBootstrapConfig()
      config.currentPhase = this.state.currentPhase
      config.activeFeatureId = this.state.activeFeatureId
      this.fsm.saveBootstrapConfig(config)
    } catch {
      // ignore if bootstrap config not yet written
    }
  }

  public onFeatureTransition(completed: Feature, next: Feature | null, cycle: number): void {
    const width = 60
    const hr = '╠' + '═'.repeat(width - 2) + '╣'
    const top = '╔' + '═'.repeat(width - 2) + '╗'
    const bot = '╚' + '═'.repeat(width - 2) + '╝'

    const padLine = (content: string): string => {
      const cleanContent = content.replace(/\x1b\[[0-9;]*m/g, '')
      const padLen = width - 6 - cleanContent.length
      return `║  ${content}${' '.repeat(Math.max(0, padLen))}  ║`
    }

    const titleStr = next
      ? `✔  FEATURE COMPLETED`
      : `✔  ALL FEATURES COMPLETED`
    const cycleStr = `[ Cycle ${cycle} ]`
    const headerContent = `${AnsiHelpers.green(titleStr)}${' '.repeat(width - 6 - titleStr.length - cycleStr.length)}${AnsiHelpers.blue(cycleStr)}`

    console.log(`\n${AnsiHelpers.blue(top)}`)
    console.log(padLine(headerContent))
    console.log(AnsiHelpers.blue(hr))
    console.log(padLine(`${AnsiHelpers.cyan(completed.id)}  ${completed.title}`))

    const scoreTLStr = completed.scoreTL !== null ? completed.scoreTL.toString() : '-'
    const scoreAdvStr = completed.scoreAdv !== null ? completed.scoreAdv.toString() : '-'

    console.log(
      padLine(
        `${AnsiHelpers.dim('Score TL:')} ${AnsiHelpers.yellow(scoreTLStr)}  │  ` +
        `${AnsiHelpers.dim('Score Adv:')} ${AnsiHelpers.yellow(scoreAdvStr)}  │  ` +
        `${AnsiHelpers.dim('Status:')} ${completed.status === 'COMPLETED' ? AnsiHelpers.green(completed.status) : AnsiHelpers.red(completed.status)}`
      )
    )

    if (next) {
      console.log(AnsiHelpers.blue(hr))
      console.log(padLine(`${AnsiHelpers.blue('⟶')}  ${AnsiHelpers.dim('NEXT FEATURE')}`))
      const priorityVal = next.priority
      const priorityStr = (priorityVal !== undefined && priorityVal !== null && !isNaN(priorityVal))
        ? priorityVal.toString()
        : '-'
      console.log(
        padLine(
          `${AnsiHelpers.cyan(next.id)}  ${next.title}  ` +
          `[${AnsiHelpers.dim('Priority:')} ${AnsiHelpers.yellow(priorityStr)}]`
        )
      )
    } else {
      console.log(AnsiHelpers.blue(hr))
      console.log(padLine(AnsiHelpers.dim('All backlog items processed — pipeline halting.')))
    }
    console.log(`${AnsiHelpers.blue(bot)}\n`)
  }

  public getPhaseDescription(phase: Phase): string {
    switch (phase) {
      case Phase.BOOTSTRAP: return 'BOOTSTRAP (Initialization)'
      case Phase.PHASE_A: return 'PHASE_A (Scope Refinement)'
      case Phase.PHASE_B: return 'PHASE_B (TDD Implementation)'
      case Phase.PHASE_C: return 'PHASE_C (Validation & Review)'
      case Phase.PHASE_D: return 'PHASE_D (Completion Check)'
      case Phase.PHASE_E: return 'PHASE_E (Documentation & Memory)'
      case Phase.PHASE_F: return 'PHASE_F (Feature Transition & Decision)'
      case Phase.CASCADE_BLOCKED: return 'CASCADE_BLOCKED (Dependency Blocked)'
      case Phase.HALTED: return 'HALTED (Execution Halted)'
      default: return phase
    }
  }
}
