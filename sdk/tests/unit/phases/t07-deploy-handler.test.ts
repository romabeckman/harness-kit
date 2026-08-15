import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeployHandler } from '../../../src/orchestrator/phases/DeployHandler'
import { Phase } from '../../../src/orchestrator/types'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

import { execFileSync } from 'node:child_process'

describe('DeployHandler', () => {
  let handler: DeployHandler
  let mockContext: any

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new DeployHandler()

    mockContext = {
      workingDir: '/mock/dir',
      config: { projectPaths: ['/mock/repo'] },
      invokeAgent: vi.fn().mockResolvedValue({ raw: 'chore: deploy commit' }),
      getActiveFeature: vi.fn().mockReturnValue({ id: 'F001', domain: 'cli' }),
      fsm: {
        loadBacklog: vi.fn().mockReturnValue([
          { id: 'F001', status: 'COMPLETED' },
        ]),
        loadBootstrapConfig: vi.fn().mockReturnValue({
          cycleCounter: { completedCycles: 1 },
        }),
        saveBootstrapConfig: vi.fn(),
        appendDecision: vi.fn(),
      },
    }
  })

  it('delegates when phase is not DEPLOY', async () => {
    const next = { handle: vi.fn().mockResolvedValue(Phase.HALTED) }
    handler.setNext(next as any)
    const result = await handler.handle(Phase.MEMORY, mockContext)
    expect(next.handle).toHaveBeenCalled()
    expect(result).toBe(Phase.HALTED)
  })

  it('skips deploy when skipDeploy config flag is set', async () => {
    mockContext.config.skipDeploy = true
    const result = await handler.handle(Phase.DEPLOY, mockContext)
    expect(result).toBe(Phase.HALTED)
    expect(execFileSync).not.toHaveBeenCalled()
    expect(mockContext.fsm.saveBootstrapConfig).toHaveBeenCalledWith(
      expect.objectContaining({ currentPhase: Phase.HALTED })
    )
  })

  it('skips deploy when projectPaths is empty', async () => {
    mockContext.config.projectPaths = []
    const result = await handler.handle(Phase.DEPLOY, mockContext)
    expect(result).toBe(Phase.HALTED)
    expect(execFileSync).not.toHaveBeenCalled()
    expect(mockContext.fsm.saveBootstrapConfig).toHaveBeenCalledWith(
      expect.objectContaining({ currentPhase: Phase.HALTED })
    )
  })

  it('skips commit/push when there are no uncommitted changes', async () => {
    // git status --porcelain returns empty
    vi.mocked(execFileSync).mockReturnValue('' as any)

    const result = await handler.handle(Phase.DEPLOY, mockContext)
    expect(result).toBe(Phase.HALTED)
    expect(execFileSync).toHaveBeenCalledWith('git', ['add', '--all'], expect.any(Object))
    expect(execFileSync).toHaveBeenCalledWith('git', ['status', '--porcelain'], expect.any(Object))
    expect(mockContext.fsm.saveBootstrapConfig).toHaveBeenCalledWith(
      expect.objectContaining({ currentPhase: Phase.HALTED })
    )
  })

  it('aborts commit when sensitive files are detected in staged changes', async () => {
    vi.mocked(execFileSync).mockImplementation((bin, args) => {
      const firstArg = args?.[0]
      if (firstArg === 'add') return '' as any
      if (firstArg === 'diff') return '.env\nsrc/app.ts' as any
      if (firstArg === 'reset') return '' as any
      return '' as any
    })

    const result = await handler.handle(Phase.DEPLOY, mockContext)
    expect(result).toBe(Phase.HALTED)
    expect(execFileSync).toHaveBeenCalledWith('git', ['reset'], expect.any(Object))
    expect(mockContext.fsm.saveBootstrapConfig).toHaveBeenCalledWith(
      expect.objectContaining({ currentPhase: Phase.HALTED })
    )
  })

  it('executes commit and push successfully when uncommitted changes are present', async () => {
    vi.mocked(execFileSync).mockImplementation((bin, args) => {
      const firstArg = args?.[0]
      if (firstArg === 'add') return '' as any
      if (firstArg === 'diff') return 'src/app.ts' as any
      if (firstArg === 'status') return 'M src/app.ts' as any
      if (firstArg === 'commit') return '' as any
      if (firstArg === 'push') return '' as any
      return '' as any
    })

    const result = await handler.handle(Phase.DEPLOY, mockContext)
    expect(result).toBe(Phase.HALTED)
    expect(mockContext.invokeAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'harness-kit:developer-devops' })
    )
    expect(execFileSync).toHaveBeenCalledWith('git', expect.arrayContaining(['commit', '-m', 'chore: deploy commit']), expect.any(Object))
    expect(execFileSync).toHaveBeenCalledWith('git', ['push'], expect.any(Object))
    expect(mockContext.fsm.saveBootstrapConfig).toHaveBeenCalledWith(
      expect.objectContaining({ currentPhase: Phase.HALTED })
    )
  })

  it('uses deterministic fallback commit message if agent invocation throws', async () => {
    mockContext.invokeAgent.mockRejectedValue(new Error('Agent error'))
    vi.mocked(execFileSync).mockImplementation((bin, args) => {
      const firstArg = args?.[0]
      if (firstArg === 'add') return '' as any
      if (firstArg === 'diff') return 'src/app.ts' as any
      if (firstArg === 'status') return 'M src/app.ts' as any
      if (firstArg === 'commit') return '' as any
      if (firstArg === 'push') return '' as any
      return '' as any
    })

    const result = await handler.handle(Phase.DEPLOY, mockContext)
    expect(result).toBe(Phase.HALTED)
    expect(execFileSync).toHaveBeenCalledWith('git', expect.arrayContaining(['commit', '-m', 'chore: deploy cycle 1']), expect.any(Object))
    expect(mockContext.fsm.saveBootstrapConfig).toHaveBeenCalledWith(
      expect.objectContaining({ currentPhase: Phase.HALTED })
    )
  })

  it('sets currentPhase in BOOTSTRAP-CONFIG.json to TRANSITION when there are BLOCKED features', async () => {
    mockContext.fsm.loadBacklog.mockReturnValue([
      { id: 'F001', status: 'COMPLETED' },
      { id: 'F002', status: 'BLOCKED' },
    ])

    const result = await handler.handle(Phase.DEPLOY, mockContext)
    expect(result).toBe(Phase.HALTED)
    expect(mockContext.fsm.saveBootstrapConfig).toHaveBeenCalledWith(
      expect.objectContaining({ currentPhase: Phase.TRANSITION })
    )
  })

  it('sets currentPhase in BOOTSTRAP-CONFIG.json to HALTED when there are no BLOCKED features', async () => {
    mockContext.fsm.loadBacklog.mockReturnValue([
      { id: 'F001', status: 'COMPLETED' },
      { id: 'F002', status: 'COMPLETED' },
    ])

    const result = await handler.handle(Phase.DEPLOY, mockContext)
    expect(result).toBe(Phase.HALTED)
    expect(mockContext.fsm.saveBootstrapConfig).toHaveBeenCalledWith(
      expect.objectContaining({ currentPhase: Phase.HALTED })
    )
  })

  it('sets currentPhase in BOOTSTRAP-CONFIG.json to TRANSITION even when skipDeploy is true if BLOCKED features exist', async () => {
    mockContext.config.skipDeploy = true
    mockContext.fsm.loadBacklog.mockReturnValue([
      { id: 'F001', status: 'BLOCKED' },
    ])

    const result = await handler.handle(Phase.DEPLOY, mockContext)
    expect(result).toBe(Phase.HALTED)
    expect(mockContext.fsm.saveBootstrapConfig).toHaveBeenCalledWith(
      expect.objectContaining({ currentPhase: Phase.TRANSITION })
    )
  })

  it('deletes activeFeatureId from BOOTSTRAP-CONFIG.json if it exists', async () => {
    mockContext.fsm.loadBootstrapConfig.mockReturnValue({
      cycleCounter: { completedCycles: 1 },
      activeFeatureId: 'F001',
    })

    const result = await handler.handle(Phase.DEPLOY, mockContext)
    expect(result).toBe(Phase.HALTED)
    const saveCalls = mockContext.fsm.saveBootstrapConfig.mock.calls
    const lastSavedConfig = saveCalls[saveCalls.length - 1][0]
    expect(lastSavedConfig).not.toHaveProperty('activeFeatureId')
  })
})
