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

function makeContext(workingDir: string, fsm: IFileStateManager, invokeAgentImpl?: () => Promise<any>): PhaseContext {
  return {
    config: { scope: 'test', score: 0.85, reworks: 3, projectPaths: [] },
    workingDir,
    fsm,
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
    it('returns PHASE_C when TDD-OUTPUT.json exists', async () => {
      const tddPath = join(workingDir, 'docs', 'specs', 'sdk_core', 'TDD-OUTPUT.json')
      writeFileSync(tddPath, JSON.stringify({ featureId: 'F001', status: 'SUCCESS', metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 0.9 } }))

      const fsm = makeFsm({
        loadBacklog: vi.fn().mockReturnValue([makeFeature()]),
        updateTaskStatus: vi.fn(),
      })

      const context = makeContext(workingDir, fsm)
      const result = await handler.handle(Phase.PHASE_B, context)

      expect(result).toBe(Phase.PHASE_C)
    })
  })

  describe('handle — chunk execution', () => {
    it('returns PHASE_C after agent runs', async () => {
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

      const result = await handler.handle(Phase.PHASE_B, context)

      expect(result).toBe(Phase.PHASE_C)
      expect(context.invokeAgent).toHaveBeenCalledTimes(1)
    })
  })
})
