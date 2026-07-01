import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { PhaseBHandler } from '../PhaseBHandler'
import { Phase } from '../../types'
import type { PhaseContext } from '../AbstractPhaseHandler'
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
    originalScope: 'scope',
    projectPaths: [],
    scoreThresholds: {
      theGrumpyTechLead: { threshold: 0.85 },
      adversarialQA: { threshold: 0.85 },
    },
    completionCriteria: { maxReworks: 3 },
    cycleCounter: { completedCycles: 0 },
    steeringRules: { user: [] },
  }
}

function makeFsm(overrides: Partial<IFileStateManager> = {}): IFileStateManager {
  return {
    loadBacklog: vi.fn().mockReturnValue([makeFeature()]),
    loadDevelopmentState: vi.fn().mockReturnValue([makeTask()]),
    loadBootstrapConfig: vi.fn().mockReturnValue(makeConfig()),
    updateTaskStatus: vi.fn(),
    appendDecision: vi.fn(),
    updateFeatureStatus: vi.fn(),
    ...overrides,
  } as unknown as IFileStateManager
}

function makeContext(workingDir: string, fsm: IFileStateManager, invokeAgentImpl?: () => Promise<any>): PhaseContext {
  return {
    config: { scope: 'test', score: 0.85, reworks: 3, projectPaths: [] },
    workingDir,
    fsm,
    state: { currentPhase: Phase.PHASE_B, activeFeatureId: 'F001', completedCycles: 0 },
    updateState: vi.fn(),
    invokeAgent: invokeAgentImpl ? vi.fn().mockImplementation(invokeAgentImpl) : vi.fn().mockResolvedValue({ success: true, stdout: '', stderr: '', raw: '' }),
    getActiveFeature: vi.fn().mockReturnValue(makeFeature()),
    checkSpecFilesPresent: vi.fn().mockReturnValue(true),
    extractTasksFromTacticalDesign: vi.fn().mockReturnValue([]),
  }
}

describe('PhaseBHandler', () => {
  let handler: PhaseBHandler
  let workingDir: string

  beforeEach(() => {
    handler = new PhaseBHandler()
    workingDir = makeTempDir()
    mkdirSync(join(workingDir, 'docs', 'specs', 'sdk_core'), { recursive: true })
  })

  describe('handle — delegates to next handler when phase is not PHASE_B', () => {
    it('returns null when no next handler is set and phase is PHASE_A', async () => {
      const fsm = makeFsm()
      const context = makeContext(workingDir, fsm)

      const result = await handler.handle(Phase.PHASE_A, context)
      expect(result).toBeNull()
    })
  })

  describe('handle — throws when no active feature', () => {
    it('throws with illegal state message when getActiveFeature returns null', async () => {
      const fsm = makeFsm()
      const context = makeContext(workingDir, fsm)
      context.getActiveFeature = vi.fn().mockReturnValue(null)

      await expect(handler.handle(Phase.PHASE_B, context)).rejects.toThrow('Illegal state')
    })
  })

  describe('handle — handleResumedExecution transitions to PHASE_C', () => {
    it('returns PHASE_C when TDD-OUTPUT.json exists and tasks are IN_PROGRESS with none remaining', async () => {
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      writeFileSync(tddPath, JSON.stringify({ featureId: 'F001', status: 'SUCCESS', metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 0.9 } }))

      const tasks = [makeTask({ taskId: 'T01', status: 'IN_PROGRESS' })]
      const fsm = makeFsm({
        loadDevelopmentState: vi.fn()
          .mockReturnValueOnce(tasks)   // allTasks in handleResumedExecution
          .mockReturnValueOnce([])      // remainingTasks (all completed now)
          .mockReturnValue([]),
        loadBacklog: vi.fn().mockReturnValue([makeFeature()]),
        updateTaskStatus: vi.fn(),
      })

      const context = makeContext(workingDir, fsm)
      const result = await handler.handle(Phase.PHASE_B, context)

      expect(result).toBe(Phase.PHASE_C)
      expect(fsm.updateTaskStatus).toHaveBeenCalledWith('F001', 'T01', '-', 'COMPLETED')
    })

    it('deletes TDD-OUTPUT.json and continues in PHASE_B when IN_PROGRESS tasks remain after resume', async () => {
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      writeFileSync(tddPath, JSON.stringify({ featureId: 'F001', status: 'SUCCESS', metrics: {} }))

      const inProgress = [makeTask({ taskId: 'T01', status: 'IN_PROGRESS' })]
      const remaining = [makeTask({ taskId: 'T02', status: 'NOT_STARTED' })]

      // After first resumed execution cleanup, still has NOT_STARTED tasks
      // loadDevelopmentState sequence:
      //   1. handleResumedExecution: allTasks (T01 IN_PROGRESS)
      //   2. handleResumedExecution: remainingTasks after update (T02 NOT_STARTED)
      //   3. main loop: allTasks for cleanup check
      //   4. main loop: nonCompletedTasks = [T02] -> chunk -> invokeAgent -> no TDD-OUTPUT (agent didn't create it)
      //   → return PHASE_B
      const fsm = makeFsm({
        loadDevelopmentState: vi.fn()
          .mockReturnValueOnce(inProgress)
          .mockReturnValueOnce(remaining)
          .mockReturnValueOnce(remaining)
          .mockReturnValueOnce(remaining),
        loadBacklog: vi.fn().mockReturnValue([makeFeature()]),
        updateTaskStatus: vi.fn(),
      })

      const context = makeContext(workingDir, fsm)
      // After agent runs, TDD-OUTPUT.json is NOT created (agent failed)
      context.invokeAgent = vi.fn().mockResolvedValue({ success: false, stdout: '', stderr: '', raw: '' })

      const result = await handler.handle(Phase.PHASE_B, context)

      expect(result).toBe(Phase.PHASE_B)
    })
  })

  describe('handle — chunk execution', () => {
    it('returns PHASE_C when all tasks complete after agent creates TDD-OUTPUT.json', async () => {
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')

      const tasks = [makeTask({ taskId: 'T01', status: 'NOT_STARTED' })]

      const fsm = makeFsm({
        loadDevelopmentState: vi.fn()
          .mockReturnValueOnce([])      // handleResumedExecution: no in-progress
          .mockReturnValueOnce(tasks)   // allTasks for cleanup check
          .mockReturnValueOnce(tasks)   // nonCompletedTasks
          .mockReturnValueOnce([]),     // remainingTasks after completeChunk
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

      const result = await handler.handle(Phase.PHASE_B, context)

      expect(result).toBe(Phase.PHASE_C)
    })

    it('returns PHASE_B when agent does NOT create TDD-OUTPUT.json (failed execution)', async () => {
      const tasks = [makeTask({ taskId: 'T01', status: 'NOT_STARTED' })]

      const fsm = makeFsm({
        loadDevelopmentState: vi.fn()
          .mockReturnValueOnce([])
          .mockReturnValueOnce(tasks)
          .mockReturnValueOnce(tasks),
        loadBootstrapConfig: vi.fn().mockReturnValue(makeConfig()),
        loadBacklog: vi.fn().mockReturnValue([makeFeature()]),
        updateTaskStatus: vi.fn(),
      })

      const context = makeContext(workingDir, fsm)
      // Agent runs but doesn't write TDD-OUTPUT.json

      const result = await handler.handle(Phase.PHASE_B, context)

      expect(result).toBe(Phase.PHASE_B)
    })

    it('uses chunk size 100 on retry (reworks > 0) instead of 4', async () => {
      const feature = makeFeature({ reworks: 1 })
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')

      // Create 5 tasks — with chunk size 4 we'd need 2 iterations, but reworks>0 uses 100
      const tasks = Array.from({ length: 5 }, (_, i) =>
        makeTask({ taskId: `T0${i + 1}`, status: 'NOT_STARTED' })
      )

      const fsm = makeFsm({
        loadDevelopmentState: vi.fn()
          .mockReturnValueOnce([])       // handleResumedExecution
          .mockReturnValueOnce(tasks)    // allTasks cleanup
          .mockReturnValueOnce(tasks)    // nonCompletedTasks
          .mockReturnValueOnce([]),      // remainingTasks after completeChunk (all done at once)
        loadBootstrapConfig: vi.fn().mockReturnValue(makeConfig()),
        loadBacklog: vi.fn().mockReturnValue([feature]),
        updateTaskStatus: vi.fn(),
      })

      const context = makeContext(workingDir, fsm, async () => {
        writeFileSync(tddPath, JSON.stringify({ featureId: 'F001', status: 'SUCCESS', metrics: { totalTests: 5, passed: 5, failed: 0, coverage: 0.9 } }))
        return { success: true, stdout: '', stderr: '', raw: '' }
      })
      context.getActiveFeature = vi.fn().mockReturnValue(feature)

      const result = await handler.handle(Phase.PHASE_B, context)

      // Agent invoked exactly once (all 5 tasks in one chunk due to reworks > 0)
      expect(context.invokeAgent).toHaveBeenCalledTimes(1)
      expect(result).toBe(Phase.PHASE_C)
    })
  })

  /**
   * Consolidation tests: to avoid the cleanup step deleting the pre-seeded TEMP.jsonl,
   * we keep one NOT_STARTED task in dev state (so inProgressTasks.length > 0 → cleanup skipped).
   * The agent then writes chunk2 to TDD-OUTPUT.json; the handler appends it to the JSONL,
   * marks the task COMPLETED, and consolidates both chunks.
   */
  describe('mergeTddOutputs — via consolidation of multi-chunk JSONL', () => {
    function setupConsolidationTest(chunk1: object, chunk2: object, workDir: string) {
      const tddPath = join(workDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      const tempPath = join(workDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT-TEMP.jsonl')

      // Pre-seed TEMP.jsonl with chunk1
      writeFileSync(tempPath, JSON.stringify(chunk1) + '\n')

      const pendingTask = makeTask({ taskId: 'T02', status: 'NOT_STARTED' })

      const fsm = makeFsm({
        // call 1: handleResumedExecution allTasks — T02 NOT_STARTED, no tddPath yet → no-op
        // call 2: cleanup allTasks — T02 NOT_STARTED → inProgressTasks.length > 0 → skip cleanup
        // call 3: while loop nonCompletedTasks — T02 → execute chunk
        // call 4: completeChunk remainingTasks — [] → allDone → consolidate
        loadDevelopmentState: vi.fn()
          .mockReturnValueOnce([pendingTask])  // handleResumedExecution
          .mockReturnValueOnce([pendingTask])  // cleanup check
          .mockReturnValueOnce([pendingTask])  // while loop nonCompletedTasks
          .mockReturnValueOnce([]),            // completeChunk remainingTasks
        loadBootstrapConfig: vi.fn().mockReturnValue(makeConfig()),
        loadBacklog: vi.fn().mockReturnValue([makeFeature()]),
        updateTaskStatus: vi.fn(),
      })

      const invokeAgentImpl = async () => {
        writeFileSync(tddPath, JSON.stringify(chunk2))
        return { success: true, stdout: '', stderr: '', raw: '' }
      }

      const context = makeContext(workDir, fsm, invokeAgentImpl)
      return { tddPath, tempPath, fsm, context }
    }

    it('consolidates two SUCCESS chunks: sums metrics, unions files, keeps SUCCESS status', async () => {
      const chunk1 = { featureId: 'F001', status: 'SUCCESS', metrics: { totalTests: 3, passed: 3, failed: 0, coverage: 0.8 }, modifiedFiles: ['a.ts'], reworksCount: 0 }
      const chunk2 = { featureId: 'F001', status: 'SUCCESS', metrics: { totalTests: 2, passed: 2, failed: 0, coverage: 0.9 }, modifiedFiles: ['b.ts'], reworksCount: 0 }

      const { tddPath, tempPath, context } = setupConsolidationTest(chunk1, chunk2, workingDir)
      const result = await handler.handle(Phase.PHASE_B, context)

      expect(result).toBe(Phase.PHASE_C)
      expect(existsSync(tddPath)).toBe(true)
      expect(existsSync(tempPath)).toBe(false)

      const consolidated = JSON.parse(readFileSync(tddPath, 'utf8'))
      expect(consolidated.status).toBe('SUCCESS')
      expect(consolidated.metrics.totalTests).toBe(5)
      expect(consolidated.metrics.passed).toBe(5)
      expect(consolidated.metrics.coverage).toBe(0.9)
      expect(consolidated.modifiedFiles).toEqual(expect.arrayContaining(['a.ts', 'b.ts']))
    })

    it('FAILED status wins over SUCCESS when merging chunks', async () => {
      const chunk1 = { featureId: 'F001', status: 'SUCCESS', metrics: { totalTests: 2, passed: 2, failed: 0, coverage: 0.8 }, modifiedFiles: [], reworksCount: 0 }
      const chunk2 = { featureId: 'F001', status: 'FAILED', metrics: { totalTests: 3, passed: 1, failed: 2, coverage: 0.5 }, modifiedFiles: [], reworksCount: 0 }

      const { tddPath, context } = setupConsolidationTest(chunk1, chunk2, workingDir)
      await handler.handle(Phase.PHASE_B, context)

      const consolidated = JSON.parse(readFileSync(tddPath, 'utf8'))
      expect(consolidated.status).toBe('FAILED')
      expect(consolidated.metrics.totalTests).toBe(5)
      expect(consolidated.metrics.failed).toBe(2)
    })

    it('deduplicates modifiedFiles across chunks', async () => {
      const chunk1 = { featureId: 'F001', status: 'SUCCESS', metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 0.9 }, modifiedFiles: ['a.ts', 'b.ts'], reworksCount: 0 }
      const chunk2 = { featureId: 'F001', status: 'SUCCESS', metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 0.9 }, modifiedFiles: ['b.ts', 'c.ts'], reworksCount: 0 }

      const { tddPath, context } = setupConsolidationTest(chunk1, chunk2, workingDir)
      await handler.handle(Phase.PHASE_B, context)

      const consolidated = JSON.parse(readFileSync(tddPath, 'utf8'))
      const uniqueFiles = new Set(consolidated.modifiedFiles)
      expect(uniqueFiles.size).toBe(consolidated.modifiedFiles.length)
      expect(consolidated.modifiedFiles).toContain('b.ts')
    })

    it('uses reworksCount max across chunks', async () => {
      const chunk1 = { featureId: 'F001', status: 'SUCCESS', metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 0.8 }, modifiedFiles: [], reworksCount: 1 }
      const chunk2 = { featureId: 'F001', status: 'SUCCESS', metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 0.8 }, modifiedFiles: [], reworksCount: 3 }

      const { tddPath, context } = setupConsolidationTest(chunk1, chunk2, workingDir)
      await handler.handle(Phase.PHASE_B, context)

      const consolidated = JSON.parse(readFileSync(tddPath, 'utf8'))
      expect(consolidated.reworksCount).toBe(3)
    })
  })
})
