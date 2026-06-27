import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { Phase } from './types'
import type { OrchestratorConfig, OrchestratorState, OnDiskState } from './types'
import { ReentryResolver } from './ReentryResolver'
import { FileStateManager } from '../file-state/FileStateManager'
import type { IFileStateManager } from '../file-state/FileStateManager'
import { ContextAssembler } from '../context-assembler/ContextAssembler'
import { ValidationGate } from '../validation-gate/ValidationGate'
import { JsonExtractionProtocol } from '../json-extraction/JsonExtractionProtocol'
import { isExtractionResult } from '../json-extraction/types'
import type { Feature, Task } from '../file-state/types'
import { ClaudeCodeRunner } from '../agent-runner/claude-code/ClaudeCodeRunner'
import { ClaudeAgentRunner } from '../agent-runner/claude-agent/ClaudeAgentRunner'
import { AntigravityRunner } from '../agent-runner/antigravity/AntigravityRunner'
import { AgentRunnerFactory } from '../agent-runner/AgentRunnerFactory'
import { TokenLedger } from '../telemetry/TokenLedger'

export interface HarnessOrchestratorOptions {
  workingDir?: string
}

export class HarnessOrchestrator {
  private readonly config: OrchestratorConfig
  private readonly agentRunner: import('../agent-runner/IAgentRunner').IAgentRunner
  private readonly fsm: IFileStateManager
  private readonly ledger: TokenLedger
  private readonly workingDir: string
  private state: OrchestratorState

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
  }

  getState(): OrchestratorState {
    return { ...this.state }
  }

  tokenReport(): void {
    this.ledger.printReport()
  }

  // ─── Agent invocation with telemetry ─────────────────────────────────────

  private async invokeAgent(invocation: import('../agent-runner/types').AgentInvocation): Promise<import('../agent-runner/types').AgentOutput> {
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
      await this.runBootstrap()
    }
  }

  // ─── Phase dispatch ───────────────────────────────────────────────────────

  private async dispatch(phase: Phase): Promise<Phase> {
    if (phase === Phase.BOOTSTRAP) {
      return this.runBootstrap()
    }

    const features = this.fsm.loadBacklog()
    const activeFeature = this.getActiveFeature(features)

    const requireActiveFeature = (p: string): Feature => {
      if (!activeFeature) throw new Error(`Illegal state: phase ${p} requires an active feature but none is set`)
      return activeFeature
    }

    switch (phase) {
      case Phase.PHASE_A:
        return this.runPhaseA(activeFeature, features)

      case Phase.PHASE_B:
        return this.runPhaseB(requireActiveFeature(phase))

      case Phase.PHASE_C:
        return this.runPhaseC(requireActiveFeature(phase))

      case Phase.PHASE_D:
        return this.runPhaseD(features)

      case Phase.PHASE_E:
        return this.runPhaseE(requireActiveFeature(phase), features)

      case Phase.CASCADE_BLOCKED:
        return this.runCascadeBlocked(requireActiveFeature(phase))

      default:
        return Phase.HALTED
    }
  }

  // ─── BOOTSTRAP ────────────────────────────────────────────────────────────

  private async runBootstrap(): Promise<Phase> {
    this.fsm.ensureProductFiles()

    // Skip backlog generation if already populated (resume path)
    const existing = this.fsm.loadBacklog()
    if (existing.length > 0) return Phase.PHASE_A

    // Generate backlog from scope via software-architect agent
    const productDir = this.config.productDir ?? join(this.workingDir, 'docs', 'product')
    const backlogPath = join(productDir, 'BACKLOG.md')

    const prompt = [
      `You are the autonomous orchestrator bootstrap agent.`,
      ``,
      `Parse the project scope below and generate a BACKLOG.md table. Write it to: ${backlogPath}`,
      ``,
      `Table columns (exact):`,
      `| ID | Title | Domain | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |`,
      ``,
      `Rules:`,
      `- ID: F001, F002, ... (sequential)`,
      `- Domain: snake_case of feature title`,
      `- Priority: CRITICAL, HIGH, MEDIUM, or LOW`,
      `- Dependencies: comma-separated IDs, or None`,
      `- Reworks: 0`,
      `- Score (TL) and Score (Adv): -`,
      `- Status: NOT_STARTED`,
      `- Each row is one deliverable feature`,
      `- Bold ID and Title: **F001** and **Feature Name**`,
      ``,
      `Project paths: ${this.config.projectPaths.join(', ')}`,
      ``,
      `## Scope`,
      ``,
      this.config.scope,
    ].join('\n')

    await this.invokeAgent({
      skill: 'harness-kit:autonomous-orchestrator:bootstrap',
      agent: 'software-architect',
      mode: 'autonomous',
      payload: {},
      prompt,
    })

    return Phase.PHASE_A
  }

  // ─── PHASE_A ──────────────────────────────────────────────────────────────

  private async runPhaseA(activeFeature: Feature | null, features: Feature[]): Promise<Phase> {
    if (!activeFeature) {
      // No feature to work on → HALTED
      return Phase.HALTED
    }

    // Check for blocked dependency
    const blocked = activeFeature.dependencies.some(depId => {
      const dep = features.find(f => f.id === depId)
      return dep?.status === 'BLOCKED'
    })
    if (blocked) return Phase.CASCADE_BLOCKED

    // Mark feature IN_PROGRESS
    this.fsm.updateFeatureStatus(activeFeature.id, 'IN_PROGRESS')

    // Invoke scope-refinement agent
    const payload = ContextAssembler.buildPhaseAPayload(activeFeature, this.config.projectPaths)
    await this.invokeAgent({
      skill: 'scope-refinement',
      agent: 'software-architect',
      mode: 'autonomous',
      payload,
    })

    // Check if spec files were created by the agent
    const specFilesPresent = this.checkSpecFilesPresent(activeFeature.domain)
    if (!specFilesPresent) return Phase.PHASE_A

    // A4: extract tasks from Section 6 of 003-*-tactical-design.md
    const existingTasks = this.fsm.loadDevelopmentState()
      .filter(t => t.featureId === activeFeature.id)
    if (existingTasks.length === 0) {
      const extracted = this.extractTasksFromTacticalDesign(activeFeature.domain)
      const projectName = this.config.projectPaths[0]?.split('/').pop() ?? 'project'
      const tasks = extracted.map(t => ({
        featureId: activeFeature.id,
        taskId: t.taskId,
        project: projectName,
        description: t.description,
        domain: activeFeature.domain,
        currentPhase: '-' as const,
        status: 'NOT_STARTED' as const,
      }))
      if (tasks.length > 0) this.fsm.appendTasks(tasks)
    }

    return Phase.PHASE_B
  }

  private extractTasksFromTacticalDesign(domain: string): Array<{ taskId: string; description: string }> {
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

  // ─── PHASE_B ──────────────────────────────────────────────────────────────

  private async runPhaseB(activeFeature: Feature): Promise<Phase> {
    const tddOutputPath = join(this.workingDir, 'docs', 'specs', activeFeature.domain, 'TDD-OUTPUT.json')

    // If TDD-OUTPUT.json already exists, all tasks are done — advance
    if (existsSync(tddOutputPath)) {
      const allTasks = this.fsm.loadDevelopmentState().filter(t => t.featureId === activeFeature.id)
      for (const task of allTasks) {
        if (task.status !== 'COMPLETED') {
          this.fsm.updateTaskStatus(activeFeature.id, task.taskId, '-', 'COMPLETED')
        }
      }
      return Phase.PHASE_C
    }

    // Mark all tasks IN_PROGRESS then invoke tdd-orchestrator once for the whole feature
    const tasks = this.fsm.loadDevelopmentState().filter(t => t.featureId === activeFeature.id)
    for (const task of tasks) {
      if (task.status === 'NOT_STARTED') {
        this.fsm.updateTaskStatus(activeFeature.id, task.taskId, 'IMPLEMENTATION', 'IN_PROGRESS')
      }
    }

    const isRetry = activeFeature.reworks > 0
    const payload = ContextAssembler.buildPhaseBPayload(
      activeFeature,
      tasks,
      this.config.projectPaths,
      isRetry
    )
    await this.invokeAgent({
      skill: 'tdd-orchestrator',
      agent: 'developer-backend',
      mode: 'autonomous',
      payload,
    })

    // Check if TDD-OUTPUT.json was generated
    if (existsSync(tddOutputPath)) {
      const allTasks = this.fsm.loadDevelopmentState().filter(t => t.featureId === activeFeature.id)
      for (const task of allTasks) {
        this.fsm.updateTaskStatus(activeFeature.id, task.taskId, '-', 'COMPLETED')
      }
      return Phase.PHASE_C
    }

    // Agent ran but didn't produce TDD-OUTPUT.json — retry Phase B
    return Phase.PHASE_B
  }

  // ─── PHASE_C ──────────────────────────────────────────────────────────────

  private async runPhaseC(activeFeature: Feature): Promise<Phase> {
    const config = this.fsm.loadBootstrapConfig()

    // Invoke the-grumpy-tech-lead
    const payloadC = ContextAssembler.buildPhaseCPayload(activeFeature, this.config.projectPaths)
    const tlOutput = await this.invokeAgent({
      skill: 'the-grumpy-tech-lead',
      agent: 'harness-code-reviewer',
      mode: 'autonomous',
      payload: payloadC,
    })

    // Invoke adversarial-qa
    const advOutput = await this.invokeAgent({
      skill: 'adversarial-qa',
      agent: 'harness-qa',
      mode: 'autonomous',
      payload: payloadC,
    })

    // Extract scores
    const tlExtraction = JsonExtractionProtocol.extract(tlOutput.raw)
    const advExtraction = JsonExtractionProtocol.extract(advOutput.raw)

    let scoreTL = 0
    let scoreAdv = 0
    let hasHighCriticalVuln = false
    let isCrashing = false

    if (isExtractionResult(tlExtraction)) {
      const data = tlExtraction.data as Record<string, unknown>
      scoreTL = typeof data['scoreTL'] === 'number' ? data['scoreTL'] :
        typeof data['score'] === 'number' ? data['score'] : 0
    }

    if (isExtractionResult(advExtraction)) {
      const data = advExtraction.data as Record<string, unknown>
      scoreAdv = typeof data['scoreAdv'] === 'number' ? data['scoreAdv'] :
        typeof data['score'] === 'number' ? data['score'] : 0
      hasHighCriticalVuln = data['hasHighCriticalVuln'] === true
      isCrashing = data['isCrashing'] === true
    }

    // Evaluate verdict
    const result = ValidationGate.evaluate(
      { scoreTL, scoreAdv, hasHighCriticalVuln, isCrashing },
      activeFeature.reworks,
      config,
      isCrashing
    )

    this.fsm.appendDecision({
      featureId: activeFeature.id,
      decision: `Phase C verdict: ${result.verdict}`,
      scores: { tl: scoreTL, adv: scoreAdv },
      rationale: result.reason,
    })

    switch (result.verdict) {
      case 'PASS':
        this.fsm.updateFeatureStatus(activeFeature.id, 'COMPLETED', { tl: scoreTL, adv: scoreAdv })
        return Phase.PHASE_D

      case 'RETRY':
        this.fsm.incrementReworks(activeFeature.id)
        this.fsm.writeReworkLog(activeFeature.domain, result.reason)
        this.fsm.updateAllFeatureTasks(activeFeature.id, '-', 'NOT_STARTED')
        return Phase.PHASE_B

      case 'BLOCK':
        this.fsm.updateFeatureStatus(activeFeature.id, 'BLOCKED', { tl: scoreTL, adv: scoreAdv })
        return Phase.PHASE_D

      case 'FAIL':
        this.fsm.updateFeatureStatus(activeFeature.id, 'FAILED', { tl: scoreTL, adv: scoreAdv })
        return Phase.PHASE_D

      default:
        return Phase.PHASE_D
    }
  }

  // ─── PHASE_D ──────────────────────────────────────────────────────────────

  private async runPhaseD(features: Feature[]): Promise<Phase> {
    // Completion check — always advance to PHASE_E
    const completed = features.filter(f => f.status === 'COMPLETED').length
    this.fsm.appendDecision({
      featureId: null,
      decision: `Phase D: completion check — ${completed}/${features.length} features completed.`,
    })
    return Phase.PHASE_E
  }

  // ─── PHASE_E ──────────────────────────────────────────────────────────────

  private async runPhaseE(activeFeature: Feature, features: Feature[]): Promise<Phase> {
    const config = this.fsm.loadBootstrapConfig()
    const decisions = this.fsm.loadRecentDecisions(5)
    const payload = ContextAssembler.buildPhaseEPayload(
      activeFeature,
      config.cycleCounter.completedCycles,
      decisions
    )

    await this.invokeAgent({
      skill: 'project-memory',
      agent: 'developer-backend',
      mode: 'autonomous',
      payload,
    })

    // Increment cycle counter
    config.cycleCounter.completedCycles += 1
    this.fsm.saveBootstrapConfig(config)
    this.state = { ...this.state, completedCycles: config.cycleCounter.completedCycles }

    // Check if more features to process
    const nextFeature = features.find(f => f.status === 'NOT_STARTED')
    if (nextFeature) {
      this.state = { ...this.state, activeFeatureId: nextFeature.id }
      return Phase.PHASE_A
    }

    return Phase.HALTED
  }

  // ─── CASCADE_BLOCKED ──────────────────────────────────────────────────────

  private async runCascadeBlocked(activeFeature: Feature): Promise<Phase> {
    this.fsm.updateFeatureStatus(activeFeature.id, 'BLOCKED')
    this.fsm.appendDecision({
      featureId: activeFeature.id,
      decision: `Cascade block: blocked because dependency is BLOCKED.`,
    })
    return Phase.PHASE_D
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getActiveFeature(features: Feature[]): Feature | null {
    // If we have an activeFeatureId, use it
    if (this.state.activeFeatureId) {
      const found = features.find(f => f.id === this.state.activeFeatureId)
      if (found) return found
    }
    // Otherwise pick first NOT_STARTED or IN_PROGRESS
    return features.find(f => f.status === 'NOT_STARTED' || f.status === 'IN_PROGRESS') ?? null
  }

  private checkSpecFilesPresent(domain: string): boolean {
    const specsDir = join(this.workingDir, 'docs', 'specs', domain)
    if (!existsSync(specsDir)) return false
    try {
      const files = readdirSync(specsDir)
      return files.some((f: string) => f.includes('test-scenarios') || f.startsWith('004-'))
    } catch {
      return false
    }
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
