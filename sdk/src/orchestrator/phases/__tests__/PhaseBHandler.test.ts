import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, renameSync } from 'node:fs'
import { DevelopmentHandler } from '../DevelopmentHandler'
import { DebugContext } from '../../../cli/DebugContext'
import { Complexity, Phase } from '../../types'
import type { Reviewontext } from '../AbstractPhaseHandler'
import type { IFileStateManager } from '../../../file-state/FileStateManager'
import type { Feature, Task, BootstrapConfig } from '../../../file-state/types'

vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>()
  return { ...fs, renameSync: vi.fn(fs.renameSync) }
})

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
    existScope: vi.fn().mockReturnValue(true),
    loadScope: vi.fn().mockReturnValue('test scope'),
    existRefinement: vi.fn().mockReturnValue(false),
    loadRefinement: vi.fn().mockReturnValue(''),
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

  afterEach(() => DebugContext.reset())

  it.each([true, false])('preserves the exact development report only when debug is %s', async debug => {
    if (debug) DebugContext.enable()
    const report = Buffer.from('\uFEFF{ malformed report', 'utf8')
    const path = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
    const snapshot = join(workingDir, 'docs', 'specs', 'sdk_core', '.debug', 'TDD-OUTPUT.json')
    const context = makeContext(workingDir, makeFsm(), async () => {
      writeFileSync(path, report)
      return { success: true }
    })

    await expect(handler.handle(Phase.DEVELOPMENT, context)).resolves.toBe(Phase.REVIEW)
    expect(existsSync(snapshot)).toBe(debug)
    if (debug) expect(readFileSync(snapshot)).toEqual(report)
  })

  it('continues to review when the debug snapshot cannot be written', async () => {
    DebugContext.enable()
    const specs = join(workingDir, 'docs', 'specs', 'sdk_core')
    writeFileSync(join(specs, '.debug'), 'not a directory')
    const report = JSON.stringify({ featureId: 'F001', metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 0 }, modifiedFiles: [], reworksCount: 0 })
    const context = makeContext(workingDir, makeFsm(), async () => {
      writeFileSync(join(specs, 'TDD-OUTPUT.json'), report)
      return { success: true }
    })

    await expect(handler.handle(Phase.DEVELOPMENT, context)).resolves.toBe(Phase.REVIEW)
    expect(readFileSync(join(specs, 'TDD-OUTPUT.json'), 'utf8')).toBe(report)
  })

  it('sends failed TDD output to review and keeps tasks incomplete', async () => {
    const path = join(workingDir, 'docs/specs/sdk_core/TDD-OUTPUT.json')
    const fsm = makeFsm()
    const context = makeContext(workingDir, fsm, async () => {
      writeFileSync(path, JSON.stringify({ featureId: 'F001', status: 'FAILED', metrics: { totalTests: 46, passed: 46, failed: 0, coverage: 0 }, modifiedFiles: [], reworksCount: 0, developerHandoff: 'T04 needs refinement' }))
      return { success: true, raw: '' }
    })
    expect(await handler.handle(Phase.DEVELOPMENT, context)).toBe(Phase.REVIEW)
    expect(fsm.updateTaskStatus).not.toHaveBeenCalledWith('F001', 'T01', '-', 'COMPLETED')
    expect(fsm.appendDecision).toHaveBeenCalledWith(expect.objectContaining({ decision: expect.stringContaining('FAILED') }))
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
    it('returns REVIEW when TDD-OUTPUT.json exists and no tasks remain pending', async () => {
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      writeFileSync(tddPath, JSON.stringify({
        featureId: 'F001',
        status: 'SUCCESS',
        metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 0.9 },
        modifiedFiles: [],
        developerHandoff: 'Ready for review.',
        reworksCount: 0,
      }))

      const fsm = makeFsm({
        loadBacklog: vi.fn().mockReturnValue([makeFeature()]),
        loadDevelopmentState: vi.fn().mockReturnValue([makeTask({ status: 'COMPLETED' })]),
        updateTaskStatus: vi.fn(),
      })

      const context = makeContext(workingDir, fsm)
      const result = await handler.handle(Phase.DEVELOPMENT, context)

      expect(result).toBe(Phase.REVIEW)
      expect(context.invokeAgent).not.toHaveBeenCalled()
    })

    it('runs development again for a legacy output while tasks remain pending', async () => {
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      writeFileSync(tddPath, JSON.stringify({
        featureId: 'F001',
        status: 'SUCCESS',
        metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 0.9 },
        modifiedFiles: [],
        developerHandoff: 'Stale output from an earlier run.',
        reworksCount: 0,
      }))

      const fsm = makeFsm({ updateTaskStatus: vi.fn() })
      const context = makeContext(workingDir, fsm)

      await expect(handler.handle(Phase.DEVELOPMENT, context)).resolves.toBe(Phase.REVIEW)
      expect(context.invokeAgent).toHaveBeenCalledOnce()
      expect(fsm.updateTaskStatus).not.toHaveBeenCalledWith('F001', 'T01', '-', 'COMPLETED')
    })

    it('does not accept a malformed existing TDD-OUTPUT.json', async () => {
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      writeFileSync(tddPath, '{ existing output }')
      const fsm = makeFsm({ updateTaskStatus: vi.fn() })
      const context = makeContext(workingDir, fsm)

      await expect(handler.handle(Phase.DEVELOPMENT, context)).resolves.toBe(Phase.REVIEW)
      expect(fsm.updateTaskStatus).not.toHaveBeenCalledWith('F001', 'T01', '-', 'COMPLETED')
      expect(context.invokeAgent).toHaveBeenCalledOnce()
    })
  })

  describe('handle — chunk execution', () => {
    it('records a Dreaming episode from a BOM-prefixed report while correcting the rework count', async () => {
      const path = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      const fsm = makeFsm()
      const context = makeContext(workingDir, fsm, async () => {
        writeFileSync(path, '\uFEFF' + JSON.stringify({ featureId: 'F001', metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 0 }, modifiedFiles: [], reworksCount: 1 }))
        return { success: true, session: { id: 'session-1' } }
      })
      const dreaming = { recordDevelopment: vi.fn() }
      await expect(handler.handle(Phase.DEVELOPMENT, { ...context, dreaming: dreaming as any })).resolves.toBe(Phase.REVIEW)
      expect(JSON.parse(readFileSync(path, 'utf8')).reworksCount).toBe(0)
      expect(dreaming.recordDevelopment).toHaveBeenCalledWith(expect.objectContaining({ id: 'F001' }), expect.objectContaining({ reworksCount: 0 }), expect.any(Array), expect.any(Array), 'session-1')
    })
    it('returns REVIEW after agent runs with percentage coverage', async () => {
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
          metrics: { totalTests: 3, passed: 3, failed: 0, coverage: 100 },
          modifiedFiles: [],
          developerHandoff: 'Ready for review.',
          reworksCount: 0,
        }))
        return { success: true, stdout: '', stderr: '', raw: '' }
      })

      const result = await handler.handle(Phase.DEVELOPMENT, context)

      expect(result).toBe(Phase.REVIEW)
      expect(context.invokeAgent).toHaveBeenCalledTimes(1)
      expect(fsm.updateTaskStatus).toHaveBeenCalledWith('F001', 'T01', '-', 'COMPLETED')
      expect(JSON.parse(readFileSync(tddPath, 'utf8'))).not.toHaveProperty('status')
      const invokeCall = (context.invokeAgent as any).mock.calls[0][0]
      expect(invokeCall.prompt).toContain('"developerHandoff"')
      expect(invokeCall.prompt).toContain('maximum 500 characters')
    })

    it.each([[0, 1], [2, 0]])('corrects rework count %i from reported count %i and records the mismatch', async (expected, reported) => {
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      const feature = makeFeature({ reworks: expected })
      const fsm = makeFsm()
      const context = makeContext(workingDir, fsm, async () => {
        writeFileSync(tddPath, JSON.stringify({
          featureId: 'F001', status: 'SUCCESS',
          metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 100 },
          modifiedFiles: [], reworksCount: reported, extra: 'preserved',
        }))
        return { success: true }
      })
      context.getActiveFeature = vi.fn().mockReturnValue(feature)

      await expect(handler.handle(Phase.DEVELOPMENT, context)).resolves.toBe(Phase.REVIEW)
      expect(JSON.parse(readFileSync(tddPath, 'utf8'))).toMatchObject({ reworksCount: expected, extra: 'preserved' })
      expect(fsm.appendDecision).toHaveBeenCalledWith(expect.objectContaining({
        featureId: 'F001',
        rationale: expect.stringContaining(`reported ${reported}, expected ${expected}`),
      }))
      expect(context.invokeAgent).toHaveBeenCalledOnce()
    })

    it('does not record a completed rework count correction when replacing TDD output fails', async () => {
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      const fsm = makeFsm()
      const context = makeContext(workingDir, fsm, async () => {
        writeFileSync(tddPath, JSON.stringify({
          featureId: 'F001', status: 'SUCCESS',
          metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 100 },
          modifiedFiles: [], reworksCount: 1,
        }))
        return { success: true }
      })
      vi.mocked(renameSync).mockImplementationOnce(() => {
        throw new Error('Unable to replace TDD output')
      })
      await expect(handler.handle(Phase.DEVELOPMENT, context)).resolves.toBe(Phase.REVIEW)
      expect(JSON.parse(readFileSync(tddPath, 'utf8'))).toMatchObject({ reworksCount: 1 })
      expect(fsm.appendDecision).not.toHaveBeenCalledWith(expect.objectContaining({
        decision: 'Development: corrected TDD-OUTPUT.json reworksCount mismatch',
      }))
      expect(fsm.updateTaskStatus).not.toHaveBeenCalledWith('F001', 'T01', '-', 'COMPLETED')
    })

    it('keeps tasks incomplete when TDD output is absent', async () => {
      const fsm = makeFsm({ updateTaskStatus: vi.fn() })
      const context = makeContext(workingDir, fsm)

      await expect(handler.handle(Phase.DEVELOPMENT, context)).resolves.toBe(Phase.REVIEW)
      expect(fsm.updateTaskStatus).not.toHaveBeenCalledWith('F001', 'T01', '-', 'COMPLETED')
    })

    it('resumes review without invoking development when all tasks are already complete and the report is missing', async () => {
      const fsm = makeFsm({ loadDevelopmentState: vi.fn().mockReturnValue([makeTask({ status: 'COMPLETED' })]) })
      const context = makeContext(workingDir, fsm)

      await expect(handler.handle(Phase.DEVELOPMENT, context)).resolves.toBe(Phase.REVIEW)
      expect(context.invokeAgent).not.toHaveBeenCalled()
    })

    it('advances to review when the development runner returns an unsuccessful result without a report', async () => {
      const fsm = makeFsm()
      const context = makeContext(workingDir, fsm, async () => ({ success: false, raw: '' }))

      await expect(handler.handle(Phase.DEVELOPMENT, context)).resolves.toBe(Phase.REVIEW)
      expect(context.invokeAgent).toHaveBeenCalledOnce()
      expect(fsm.updateTaskStatus).not.toHaveBeenCalledWith('F001', 'T01', '-', 'COMPLETED')
    })

    it('keeps tasks incomplete when a fresh handoff belongs to another feature', async () => {
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      const fsm = makeFsm({ updateTaskStatus: vi.fn() })
      const context = makeContext(workingDir, fsm, async () => {
        writeFileSync(tddPath, JSON.stringify({
          featureId: 'F002', status: 'SUCCESS',
          metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 100 },
          modifiedFiles: [], reworksCount: 0,
        }))
        return { success: true }
      })
      await expect(handler.handle(Phase.DEVELOPMENT, context)).resolves.toBe(Phase.REVIEW)
      expect(fsm.updateTaskStatus).not.toHaveBeenCalledWith('F001', 'T01', '-', 'COMPLETED')
    })

    it('keeps tasks incomplete when the output requires refinement', async () => {
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      const fsm = makeFsm({ updateTaskStatus: vi.fn() })
      const context = makeContext(workingDir, fsm, async () => {
        writeFileSync(tddPath, JSON.stringify({
          featureId: 'F001', status: 'FAILED',
          metrics: { totalTests: 0, passed: 0, failed: 0, coverage: 0 },
          modifiedFiles: [], reworksCount: 0,
          orientation_use: [{
            orientation_id: 'restore', revision: 1, feature: 'feature:sdk_core',
            decision: 'needs_refinement', reason: 'Undefined recovery behavior', test_ref: 'SC-01',
          }],
        }))
        return { success: true }
      })
      await expect(handler.handle(Phase.DEVELOPMENT, context)).resolves.toBe(Phase.REVIEW)
      expect(fsm.updateTaskStatus).not.toHaveBeenCalledWith('F001', 'T01', '-', 'COMPLETED')
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
          modifiedFiles: [],
          developerHandoff: 'Rework complete.',
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
      expect(invokeCall.prompt).toContain('[T01] [sdk] Do something')
      expect(invokeCall.prompt.match(/<expected_output>([\s\S]*?)<\/expected_output>/)?.[1]).not.toMatch(/\bstatus\b/i)
      expect(invokeCall.prompt).toContain('"developerHandoff"')
      expect(invokeCall.prompt).toContain('maximum 500 characters')
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
          modifiedFiles: [],
          developerHandoff: 'Ready for review.',
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
        existRefinement: vi.fn().mockReturnValue(true),
        loadRefinement: vi.fn().mockReturnValue('# Refined backlog'),
      })

      const context = makeContext(workingDir, fsm, async () => {
        writeFileSync(tddPath, JSON.stringify({
          featureId: 'F001',
          status: 'SUCCESS',
          metrics: { totalTests: 2, passed: 2, failed: 0, coverage: 1.0 },
          modifiedFiles: [],
          developerHandoff: 'Retry findings addressed.',
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
      expect(invokeCall.prompt).toContain('"developerHandoff"')
      expect(invokeCall.prompt).toContain('maximum 500 characters')
      // Continuation prompt keeps compact anchors without re-sending full specifications or orientation content.
      expect(invokeCall.prompt).not.toContain('<development_specifications>')
      expect(invokeCall.prompt).toContain('<context_anchors>')
      expect(invokeCall.prompt).toContain('<project_paths>')
      expect(invokeCall.prompt).toContain('REFINEMENT.md')
      expect(invokeCall.prompt).not.toContain('SCOPE.md')
      expect(invokeCall.prompt).toContain(join(workingDir, 'docs', 'specs', 'sdk_core'))
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
          modifiedFiles: [],
          developerHandoff: 'Retry findings addressed.',
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
        loadDevelopmentState: vi.fn().mockReturnValue([makeTask({ featureId: 'F002' })]),
        updateTaskStatus: vi.fn(),
      })

      const context = makeContext(workingDir, fsm, async () => {
        writeFileSync(tddPath, JSON.stringify({
          featureId: 'F002',
          status: 'SUCCESS',
          metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 1.0 },
          modifiedFiles: [],
          developerHandoff: 'Retry findings addressed.',
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
