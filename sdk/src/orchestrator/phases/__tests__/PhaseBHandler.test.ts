import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { DevelopmentHandler } from '../DevelopmentHandler'
import { Complexity, Phase } from '../../types'
import type { Reviewontext } from '../AbstractPhaseHandler'
import type { IFileStateManager } from '../../../file-state/FileStateManager'
import type { Feature, Task, BootstrapConfig } from '../../../file-state/types'

// Use a real temp dir per test so fs logic runs end-to-end on real files
function makeTempDir(): string {
  const dir = join(tmpdir(), `phaseB-test-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'F001',
    title: 'Test Feature',
    domain: 'sdk_core',
    layer: 'backend',
    priority: 1,
    dependencies: [],
    reworks: 0,
    scoreTL: null,
    scoreAdv: null,
    status: 'IN_PROGRESS',
    ...overrides,
  }
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    featureId: 'F001',
    taskId: 'T01',
    project: 'sdk',
    description: 'Do something',
    domain: 'sdk_core',
    currentPhase: '-',
    status: 'NOT_STARTED',
    ...overrides,
  }
}

function makeConfig(): BootstrapConfig {
  return {
    projectPaths: [],
    scoreThresholdTL: 0.85,
    scoreThresholdAdv: 0.85,
    completionCriteria: { maxReworks: 3 },
    cycleCounter: { completedCycles: 0 },
    steeringRules: { user: [] },
  }
}

function makeFsm(overrides: Partial<IFileStateManager> = {}): IFileStateManager {
  const fsm = {
    loadBacklog: vi.fn().mockReturnValue([makeFeature()]),
    loadDevelopmentState: vi.fn().mockReturnValue([makeTask()]),
    loadBootstrapConfig: vi.fn().mockReturnValue(makeConfig()),
    updateTaskStatus: vi.fn(),
    appendDecision: vi.fn(),
    updateFeatureStatus: vi.fn(),
    getPendingTasks: vi.fn(),
    ...overrides,
  } as any

  if (!overrides.getPendingTasks) {
    fsm.getPendingTasks.mockImplementation((featureId: string) => {
      const tasks = fsm.loadDevelopmentState()
      return tasks.filter((t: any) => t.featureId === featureId && (t.status === 'IN_PROGRESS' || t.status === 'NOT_STARTED'))
    })
  }

  return fsm as unknown as IFileStateManager
}

function makeContext(workingDir: string, fsm: IFileStateManager, invokeAgentImpl?: () => Promise<any>): Reviewontext {
  const ctx: Reviewontext = {
    config: { scope: 'test', score: 0.85, reworks: 3, projectPaths: [], complexity: Complexity.AUTO },
    workingDir,
    fsm,
    invokeAgent: invokeAgentImpl ? vi.fn().mockImplementation(invokeAgentImpl) : vi.fn().mockResolvedValue({ success: true, stdout: '', stderr: '', raw: '' }),
    getActiveFeature: vi.fn().mockReturnValue(makeFeature()),
    checkSpecFilesPresent: vi.fn().mockReturnValue(true),
    extractTasksFromTacticalDesign: vi.fn().mockReturnValue([]),
    getDeveloperSession(agent: string, featureId?: string, phase?: Phase) {
      if (!ctx.developerSession) return undefined
      if (Array.isArray(ctx.developerSession)) {
        return ctx.developerSession.find(
          s => s.agent === agent && (!featureId || s.featureId === featureId) && (!phase || s.phase === phase)
        )?.session
      }
      const session = ctx.developerSession as any
      if (session.agent === agent && (!featureId || session.featureId === featureId) && (!phase || session.phase === phase)) {
        return session.session
      }
      return undefined
    },
    setDeveloperSession(sessionState: any) {
      if (!ctx.developerSession) {
        ctx.developerSession = [sessionState]
        return
      }
      if (Array.isArray(ctx.developerSession)) {
        const idx = ctx.developerSession.findIndex(
          s => s.agent === sessionState.agent && s.featureId === sessionState.featureId && s.phase === sessionState.phase
        )
        if (idx >= 0) {
          ctx.developerSession[idx] = sessionState
        } else {
          ctx.developerSession.push(sessionState)
        }
      } else {
        const existing = ctx.developerSession as any
        if (existing.agent === sessionState.agent && existing.featureId === sessionState.featureId && existing.phase === sessionState.phase) {
          ctx.developerSession = [sessionState]
        } else {
          ctx.developerSession = [existing, sessionState]
        }
      }
    },
  }
  return ctx
}

describe('DevelopmentHandler', () => {
  let handler: DevelopmentHandler
  let workingDir: string

  beforeEach(() => {
    handler = new DevelopmentHandler()
    workingDir = makeTempDir()
    mkdirSync(join(workingDir, 'docs', 'specs', 'sdk_core'), { recursive: true })
  })

  describe('handle — delegates to next handler when phase is not DEVELOPMENT', () => {
    it('returns null when no next handler is set and phase is PLANNING', async () => {
      const fsm = makeFsm()
      const context = makeContext(workingDir, fsm)

      const result = await handler.handle(Phase.PLANNING, context)
      expect(result).toBeNull()
    })
  })

  describe('handle — throws when no active feature', () => {
    it('throws with illegal state message when getActiveFeature returns null', async () => {
      const fsm = makeFsm()
      const context = makeContext(workingDir, fsm)
      context.getActiveFeature = vi.fn().mockReturnValue(null)

      await expect(handler.handle(Phase.DEVELOPMENT, context)).rejects.toThrow('Illegal state')
    })
  })

  describe('handle — handleResumedExecution transitions to REVIEW', () => {
    it('returns REVIEW when TDD-OUTPUT.json exists', async () => {
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      writeFileSync(tddPath, JSON.stringify({ featureId: 'F001', status: 'SUCCESS', metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 0.9 } }))

      const fsm = makeFsm({
        loadBacklog: vi.fn().mockReturnValue([makeFeature()]),
        updateTaskStatus: vi.fn(),
      })

      const context = makeContext(workingDir, fsm)
      const result = await handler.handle(Phase.DEVELOPMENT, context)

      expect(result).toBe(Phase.REVIEW)
    })
  })

  describe('handle — chunk execution', () => {
    it('returns REVIEW after agent runs', async () => {
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')

      const tasks = [makeTask({ taskId: 'T01', status: 'NOT_STARTED' })]

      const fsm = makeFsm({
        loadBootstrapConfig: vi.fn().mockReturnValue(makeConfig()),
        loadBacklog: vi.fn().mockReturnValue([makeFeature()]),
        updateTaskStatus: vi.fn(),
      })

      const context = makeContext(workingDir, fsm, async () => {
        writeFileSync(tddPath, JSON.stringify({
          featureId: 'F001',
          status: 'SUCCESS',
          metrics: { totalTests: 3, passed: 3, failed: 0, coverage: 0.85 }
        }))
        return { success: true, stdout: '', stderr: '', raw: '' }
      })

      const result = await handler.handle(Phase.DEVELOPMENT, context)

      expect(result).toBe(Phase.REVIEW)
      expect(context.invokeAgent).toHaveBeenCalledTimes(1)
    })

    it('embeds REWORK-LOG.md content in the prompt on retry run (standalone without session)', async () => {
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      const reworkLogPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'REWORK-LOG.md')
      writeFileSync(reworkLogPath, 'Mocked rework content here')

      const fsm = makeFsm({
        loadBootstrapConfig: vi.fn().mockReturnValue(makeConfig()),
        loadBacklog: vi.fn().mockReturnValue([makeFeature({ reworks: 1 })]),
        updateTaskStatus: vi.fn(),
      })

      const context = makeContext(workingDir, fsm, async () => {
        writeFileSync(tddPath, JSON.stringify({
          featureId: 'F001',
          status: 'SUCCESS',
          metrics: { totalTests: 3, passed: 3, failed: 0, coverage: 0.85 },
          reworksCount: 1
        }))
        return { success: true, stdout: '', stderr: '', raw: '' }
      })
      context.getActiveFeature = vi.fn().mockReturnValue(makeFeature({ reworks: 1 }))

      await handler.handle(Phase.DEVELOPMENT, context)

      expect(context.invokeAgent).toHaveBeenCalledTimes(1)
      const invokeCall = (context.invokeAgent as any).mock.calls[0][0]
      expect(invokeCall.session).toBeUndefined()
      expect(invokeCall.prompt).toContain(reworkLogPath)
      expect(invokeCall.prompt).toContain('<rework_log_content>')
      expect(invokeCall.prompt).toContain('Mocked rework content here')
      expect(invokeCall.prompt).toContain('<rework')
      expect(invokeCall.prompt).toContain('<development_specifications>')
      expect(invokeCall.prompt).toContain('<tasks>')
      expect(invokeCall.prompt).toContain('[T01] Do something')
      expect(invokeCall.prompt).toContain('"status": "SUCCESS"')
      expect(invokeCall.prompt).not.toContain('"SUCCESS" | "FAILED"')
    })

    it('captures developer session on initial run when output returns a session', async () => {
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      const fsm = makeFsm({
        loadBootstrapConfig: vi.fn().mockReturnValue(makeConfig()),
        loadBacklog: vi.fn().mockReturnValue([makeFeature({ reworks: 0 })]),
        updateTaskStatus: vi.fn(),
      })

      const context = makeContext(workingDir, fsm, async () => {
        writeFileSync(tddPath, JSON.stringify({
          featureId: 'F001',
          status: 'SUCCESS',
          metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 1.0 },
          reworksCount: 0
        }))
        return { success: true, stdout: '', stderr: '', raw: '', session: { id: 'DEV-123' } }
      })

      await handler.handle(Phase.DEVELOPMENT, context)

      expect(context.developerSession).toEqual([
        {
          featureId: 'F001',
          agent: 'harness-kit:developer-backend',
          session: { id: 'DEV-123' },
          phase: Phase.DEVELOPMENT,
        }
      ])
      const invokeCall = (context.invokeAgent as any).mock.calls[0][0]
      expect(invokeCall.session).toBeUndefined()
    })

    it('resumes developer session and uses continuation prompt on retry when matching session exists in array', async () => {
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      const reworkLogPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'REWORK-LOG.md')
      writeFileSync(reworkLogPath, 'Review finding: Missing null check')

      const fsm = makeFsm({
        loadBootstrapConfig: vi.fn().mockReturnValue(makeConfig()),
        loadBacklog: vi.fn().mockReturnValue([makeFeature({ reworks: 1 })]),
        updateTaskStatus: vi.fn(),
      })

      const context = makeContext(workingDir, fsm, async () => {
        writeFileSync(tddPath, JSON.stringify({
          featureId: 'F001',
          status: 'SUCCESS',
          metrics: { totalTests: 2, passed: 2, failed: 0, coverage: 1.0 },
          reworksCount: 1
        }))
        return { success: true, stdout: '', stderr: '', raw: '', session: { id: 'DEV-123' } }
      })
      context.getActiveFeature = vi.fn().mockReturnValue(makeFeature({ reworks: 1 }))
      context.developerSession = [
        {
          featureId: 'F001',
          agent: 'harness-kit:harness-tech-lead',
          session: { id: 'TL-123' },
          phase: Phase.REVIEW,
        },
        {
          featureId: 'F001',
          agent: 'harness-kit:developer-backend',
          session: { id: 'DEV-123' },
          phase: Phase.DEVELOPMENT,
        }
      ]

      await handler.handle(Phase.DEVELOPMENT, context)

      expect(context.invokeAgent).toHaveBeenCalledTimes(1)
      const invokeCall = (context.invokeAgent as any).mock.calls[0][0]
      expect(invokeCall.session).toEqual({ id: 'DEV-123' })
      expect(invokeCall.prompt).toContain('Address the findings from the latest review.')
      expect(invokeCall.prompt).toContain('Review finding: Missing null check')
      expect(invokeCall.prompt).toContain('<tasks>')
      expect(invokeCall.prompt).toContain('<expected_output>')
      // Continuation prompt should NOT re-send full development specifications or project paths/orientation
      expect(invokeCall.prompt).not.toContain('<development_specifications>')
      expect(invokeCall.prompt).not.toContain('<project_paths>')
      expect(invokeCall.prompt).not.toContain('<orientation>')
    })

    it('falls back to standalone rework prompt if developerSession is for a different phase', async () => {
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      const reworkLogPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'REWORK-LOG.md')
      writeFileSync(reworkLogPath, 'Review finding: Missing null check')

      const fsm = makeFsm({
        loadBootstrapConfig: vi.fn().mockReturnValue(makeConfig()),
        loadBacklog: vi.fn().mockReturnValue([makeFeature({ reworks: 1 })]),
        updateTaskStatus: vi.fn(),
      })

      const context = makeContext(workingDir, fsm, async () => {
        writeFileSync(tddPath, JSON.stringify({
          featureId: 'F001',
          status: 'SUCCESS',
          metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 1.0 },
          reworksCount: 1
        }))
        return { success: true, stdout: '', stderr: '', raw: '' }
      })
      context.getActiveFeature = vi.fn().mockReturnValue(makeFeature({ reworks: 1 }))
      context.developerSession = [
        {
          featureId: 'F001',
          agent: 'harness-kit:developer-backend',
          session: { id: 'DEV-123' },
          phase: Phase.REVIEW,
        }
      ]

      await handler.handle(Phase.DEVELOPMENT, context)

      const invokeCall = (context.invokeAgent as any).mock.calls[0][0]
      expect(invokeCall.session).toBeUndefined()
      expect(invokeCall.prompt).toContain('<development_specifications>')
      expect(invokeCall.prompt).toContain('<project_paths>')
    })

    it('falls back to standalone rework prompt if developerSession is for a different feature', async () => {
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      const reworkLogPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'REWORK-LOG.md')
      writeFileSync(reworkLogPath, 'Rework items')

      const fsm = makeFsm({
        loadBootstrapConfig: vi.fn().mockReturnValue(makeConfig()),
        loadBacklog: vi.fn().mockReturnValue([makeFeature({ id: 'F002', reworks: 1 })]),
        updateTaskStatus: vi.fn(),
      })

      const context = makeContext(workingDir, fsm, async () => {
        writeFileSync(tddPath, JSON.stringify({
          featureId: 'F002',
          status: 'SUCCESS',
          metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 1.0 },
          reworksCount: 1
        }))
        return { success: true, stdout: '', stderr: '', raw: '' }
      })
      context.getActiveFeature = vi.fn().mockReturnValue(makeFeature({ id: 'F002', reworks: 1 }))
      context.developerSession = {
        featureId: 'F001',
        agent: 'harness-kit:developer-backend',
        session: { id: 'DEV-123' },
        phase: Phase.DEVELOPMENT,
      }

      await handler.handle(Phase.DEVELOPMENT, context)

      const invokeCall = (context.invokeAgent as any).mock.calls[0][0]
      expect(invokeCall.session).toBeUndefined()
      expect(invokeCall.prompt).toContain('<development_specifications>')
      expect(invokeCall.prompt).toContain('<project_paths>')
    })
  })
})
