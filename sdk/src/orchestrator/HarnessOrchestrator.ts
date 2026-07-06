import { join } from 'path'
import { Phase } from './types'
import type { OrchestratorConfig, OrchestratorState, OnDiskState } from './types'
import { ReentryResolver } from './ReentryResolver'
import { FileStateManager } from '../file-state/FileStateManager'
import type { IFileStateManager } from '../file-state/FileStateManager'
import { HarnessSettings } from '../settings/HarnessSettings'
import type { Feature } from '../file-state/types'
import { AgentRunnerFactory } from '../agent-runner/AgentRunnerFactory'
import { AgentRunnerError, AgentRunnerErrorCode } from '../agent-runner/AgentRunnerError'
import { TokenLedger } from '../telemetry/TokenLedger'
import { AnsiHelpers } from '../ui/AnsiHelpers'
import {
  IPhaseHandler,
  PhaseContext,
  ExtractedTask
} from './phases'
import { ChainBuilder } from './ChainBuilder'
import { OrchestratorFormatter } from './utils/OrchestratorFormatter'
import { ProjectStateService } from './services/ProjectStateService'
import { AgentInvocationService } from './services/AgentInvocationService'
import { SteeringService } from './services/SteeringService'
import { exit } from 'process'

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
  private readonly steeringService: SteeringService

  constructor(config: OrchestratorConfig, options: HarnessOrchestratorOptions = {}) {
    this.agentRunner = config.agentRunner
      ?? (process.env.ANTHROPIC_API_KEY
        ? AgentRunnerFactory.create({ type: 'claude-sdk' })
        : AgentRunnerFactory.create({ type: 'claude-cli' }))
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
    this.ensureConfig()

    // Determine initial phase via re-entry resolver
    const onDisk = this.readOnDiskState()
    const entryPhase = ReentryResolver.resolve(onDisk)
    this.state = {
      currentPhase: entryPhase,
      activeFeatureId: onDisk.config?.activeFeatureId ?? onDisk.activeFeature?.id ?? null,
      completedCycles: onDisk.config?.cycleCounter.completedCycles ?? 0,
    }

    this.steeringService = new SteeringService(this.fsm, this.state)
    this.chain = config.chain ?? ChainBuilder.buildDefault()
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
        if (err instanceof AgentRunnerError) {
          process.stderr.write(`\n${AnsiHelpers.red('✗')} Agent error [${err.code}]: ${err.message}\n\n`)
        }
        throw err
      }

      const elapsedMs = Date.now() - phaseStartTime
      const durationStr = OrchestratorFormatter.formatDuration(elapsedMs)

      try {
        const updatedConfig = this.fsm.loadBootstrapConfig()
        this.state.activeFeatureId = updatedConfig.activeFeatureId ?? null
      } catch {
        // ignore
      }

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

  /**
   * Ensure that the orchestrator has the necessary configuration.
   * If not, try to load it from the bootstrap config.
   * If still not defined, exit the program.
   */
  private ensureConfig(): void {
    if (this.config.scope && this.config.projectPaths) {
      return
    }

    const bootConfig = this.fsm.loadBootstrapConfig()

    if (!bootConfig.originalScope) {
      process.stderr.write(`\n\n${AnsiHelpers.red(`✗ [Error] Scope is not defined`)}\n\n`)
      exit(1)
    }

    if (!bootConfig.projectPaths || bootConfig.projectPaths.length === 0) {
      process.stderr.write(`\n\n${AnsiHelpers.red(`✗ [Error] Project paths are not defined`)}\n\n`)
      exit(1)
    }

    this.config.scope = bootConfig.originalScope
    this.config.projectPaths = bootConfig.projectPaths
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


  public applySteeringActions(actions: import('./SteeringAnalyzer').SteeringAction[]): void {
    this.steeringService.applySteeringActions(actions)
  }

  public invokeAgent(invocation: import('../agent-runner/types').AgentInvocation): Promise<import('../agent-runner/types').AgentOutput> {
    return this.agentInvocationService.invokeAgent(invocation, this.state.currentPhase, this.config, this.settings)
  }

  public getActiveFeature(): Feature | null {
    const features = this.fsm.loadBacklog();
    const config = this.fsm.loadBootstrapConfig();

    if (config.activeFeatureId) {
      const found = features.find(f => f.id === config.activeFeatureId)
      if (found) return found
    }
    return features.find(f => f.status === 'NOT_STARTED' || f.status === 'IN_PROGRESS') ?? null
  }

  public checkSpecFilesPresent(domain: string): boolean {
    return this.projectStateService.checkSpecFilesPresent(domain)
  }

  public extractTasksFromTacticalDesign(domain: string): ExtractedTask[] {
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
