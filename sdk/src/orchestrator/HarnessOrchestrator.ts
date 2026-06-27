import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { Phase } from './types'
import type { OrchestratorConfig, OrchestratorState, OnDiskState } from './types'
import { ReentryResolver } from './ReentryResolver'
import { FileStateManager } from '../file-state/FileStateManager'
import type { IFileStateManager } from '../file-state/FileStateManager'
import type { Feature, Task } from '../file-state/types'
import { AgentRunnerFactory } from '../agent-runner/AgentRunnerFactory'
import { TokenLedger } from '../telemetry/TokenLedger'
import {
  IPhaseHandler,
  PhaseContext,
  BootstrapHandler,
  PhaseAHandler,
  PhaseBHandler,
  PhaseCHandler,
  PhaseDHandler,
  PhaseEHandler,
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

  constructor(config: OrchestratorConfig, options: HarnessOrchestratorOptions = {}) {
    this.agentRunner = config.agentRunner
      ?? (process.env.ANTHROPIC_API_KEY
        ? AgentRunnerFactory.create({ type: 'claude-agent' })
        : AgentRunnerFactory.create({ type: 'claude-code' }))
    this.config = config
    this.workingDir = options.workingDir ?? process.cwd()
    const productDir = config.productDir ?? join(this.workingDir, 'docs', 'product')
    this.fsm = new FileStateManager({
      productDir,
      workingDir: this.workingDir,
    })
    this.ledger = new TokenLedger(join(productDir, 'tokens.jsonl'))
    // Determine initial phase via re-entry resolver
    const onDisk = this.readOnDiskState()
    const entryPhase = ReentryResolver.resolve(onDisk)
    this.state = {
      currentPhase: entryPhase,
      activeFeatureId: onDisk.activeFeature?.id ?? null,
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
    let iterations = 0
    const MAX_ITERATIONS = 500 // guard against infinite loops
    while (this.state.currentPhase !== Phase.HALTED) {
      if (++iterations > MAX_ITERATIONS) {
        throw new Error(`HarnessOrchestrator: exceeded ${MAX_ITERATIONS} iterations — possible infinite loop at phase ${this.state.currentPhase}`)
      }
      // Persist current phase before executing
      this.persistPhase()

      const next = await this.dispatch(this.state.currentPhase)
      if (next !== this.state.currentPhase) {
        this.fsm.appendDecision({ featureId: null, decision: `Phase transition: ${this.state.currentPhase} → ${next}` })
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

  public invokeAgent(invocation: import('../agent-runner/types').AgentInvocation): Promise<import('../agent-runner/types').AgentOutput> {
    return this.invokeAgentInternal(invocation)
  }

  private async invokeAgentInternal(invocation: import('../agent-runner/types').AgentInvocation): Promise<import('../agent-runner/types').AgentOutput> {
    const controller = new AbortController()
    const timeoutMs = (this.config as any).timeoutMs ?? 300_000
    let timer: ReturnType<typeof setTimeout> | undefined

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        controller.abort()
      }, timeoutMs)
    }

    try {
      const output = await this.agentRunner.run(invocation, { signal: controller.signal })
      if (output.usage) {
        this.ledger.record(invocation.skill, invocation.agent, output.usage)
      }
      return output
    } finally {
      if (timer) clearTimeout(timer)
    }
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
    if (!existsSync(specsDir)) return false
    try {
      const files = readdirSync(specsDir)
      return files.some((f: string) => f.includes('test-scenarios') || f.startsWith('004-'))
    } catch {
      return false
    }
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
      this.fsm.saveBootstrapConfig(config)
    } catch {
      // ignore if bootstrap config not yet written
    }
  }
}
