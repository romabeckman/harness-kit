import { join } from 'path'
import { Phase } from './types'
import type { OrchestratorConfig, OrchestratorState, OnDiskState } from './types'
import { ReentryResolver } from './ReentryResolver'
import { FileStateManager } from '../file-state/FileStateManager'
import type { IFileStateManager } from '../file-state/FileStateManager'
import { HarnessSettings } from '../settings/HarnessSettings'
import type { Feature } from '../file-state/types'
import { createDefaultSteeringRules } from '../file-state/types'
import { AgentRunnerFactory } from '../agent-runner/AgentRunnerFactory'
import { AgentRunnerError, AgentRunnerErrorCode } from '../agent-runner/AgentRunnerError'
import { TokenLedger } from '../telemetry/TokenLedger'
import { AnsiHelpers } from '../ui/AnsiHelpers'
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
import { OrchestratorFormatter } from './utils/OrchestratorFormatter'
import { ProjectStateService } from './services/ProjectStateService'
import { AgentInvocationService } from './services/AgentInvocationService'

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
  private readonly projectStateService: ProjectStateService
  private readonly agentInvocationService: AgentInvocationService

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

    this.projectStateService = new ProjectStateService(this.workingDir)
    this.ledger = new TokenLedger(join(productDir, 'tokens.jsonl'))
    this.agentInvocationService = new AgentInvocationService(this.agentRunner, this.ledger)

    // When user resumes execution, we need to use the same scope as the original execution
    if (!this.config.scope) {
      try {
        const bootConfig = this.fsm.loadBootstrapConfig()
        this.config.scope = bootConfig.originalScope
        this.config.projectPaths = bootConfig.projectPaths
      } catch (err) {
        throw new Error(`Failed to load bootstrap config: ${err}`)
      }
    }

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
    const MAX_PHASE_ITERATIONS = 3
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
        OrchestratorFormatter.printPipelineHeader(this.state.currentPhase)
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
      const durationStr = OrchestratorFormatter.formatDuration(elapsedMs)

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
    return this.agentInvocationService.invokeAgent(invocation, this.state.currentPhase, this.config, this.settings)
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
    return this.projectStateService.checkSpecFilesPresent(domain)
  }

  public extractTasksFromTacticalDesign(domain: string): Array<{ taskId: string; description: string }> {
    return this.projectStateService.extractTasksFromTacticalDesign(domain)
  }

  private readOnDiskState(): OnDiskState {
    const productDir = this.config.productDir ?? join(this.workingDir, 'docs', 'product')
    return this.projectStateService.readOnDiskState(this.fsm, productDir)
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
    OrchestratorFormatter.onFeatureTransition(completed, next, cycle)
  }

  public getPhaseDescription(phase: Phase): string {
    return OrchestratorFormatter.getPhaseDescription(phase)
  }
}
