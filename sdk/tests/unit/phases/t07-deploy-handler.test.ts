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
        loadBootstrapConfig: vi.fn().mockReturnValue({
          cycleCounter: { completedCycles: 1 },
        }),
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
  })

  it('skips deploy when projectPaths is empty', async () => {
    mockContext.config.projectPaths = []
    const result = await handler.handle(Phase.DEPLOY, mockContext)
    expect(result).toBe(Phase.HALTED)
    expect(execFileSync).not.toHaveBeenCalled()
  })

  it('skips commit/push when there are no uncommitted changes', async () => {
    // git status --porcelain returns empty
    vi.mocked(execFileSync).mockReturnValue('' as any)

    const result = await handler.handle(Phase.DEPLOY, mockContext)
    expect(result).toBe(Phase.HALTED)
    expect(execFileSync).toHaveBeenCalledWith('git', ['add', '--all'], expect.any(Object))
    expect(execFileSync).toHaveBeenCalledWith('git', ['status', '--porcelain'], expect.any(Object))
  })

  it('aborts commit when sensitive files are detected in staged changes', async () => {
    vi.mocked(execFileSync).mockImplementation((bin, args) => {
      if (!args) return '' as any
      if (args[0] === 'add') return '' as any
      if (args[0] === 'diff') return '.env\nsrc/app.ts' as any
      if (args[0] === 'reset') return '' as any
      return '' as any
    })

    const result = await handler.handle(Phase.DEPLOY, mockContext)
    expect(result).toBe(Phase.HALTED)
    expect(execFileSync).toHaveBeenCalledWith('git', ['reset'], expect.any(Object))
  })

  it('executes commit and push successfully when uncommitted changes are present', async () => {
    vi.mocked(execFileSync).mockImplementation((bin, args) => {
      if (!args) return '' as any
      if (args[0] === 'add') return '' as any
      if (args[0] === 'diff') return 'src/app.ts' as any
      if (args[0] === 'status') return 'M src/app.ts' as any
      if (args[0] === 'commit') return '' as any
      if (args[0] === 'push') return '' as any
      return '' as any
    })

    const result = await handler.handle(Phase.DEPLOY, mockContext)
    expect(result).toBe(Phase.HALTED)
    expect(mockContext.invokeAgent).toHaveBeenCalled()
    expect(execFileSync).toHaveBeenCalledWith('git', expect.arrayContaining(['commit', '-m', 'chore: deploy commit']), expect.any(Object))
    expect(execFileSync).toHaveBeenCalledWith('git', ['push'], expect.any(Object))
  })

  it('uses deterministic fallback commit message if agent invocation throws', async () => {
    mockContext.invokeAgent.mockRejectedValue(new Error('Agent error'))
    vi.mocked(execFileSync).mockImplementation((bin, args) => {
      if (!args) return '' as any
      if (args[0] === 'add') return '' as any
      if (args[0] === 'diff') return 'src/app.ts' as any
      if (args[0] === 'status') return 'M src/app.ts' as any
      if (args[0] === 'commit') return '' as any
      if (args[0] === 'push') return '' as any
      return '' as any
    })

    const result = await handler.handle(Phase.DEPLOY, mockContext)
    expect(result).toBe(Phase.HALTED)
    expect(execFileSync).toHaveBeenCalledWith('git', expect.arrayContaining(['commit', '-m', 'chore: deploy cycle 1']), expect.any(Object))
  })
})
