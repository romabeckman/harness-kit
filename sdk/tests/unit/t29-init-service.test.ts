import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'node:path'
import { cmdInit } from '../../src/cli/services/init-service'

// Mock dependencies
const mockInput = vi.fn()
const mockConfirm = vi.fn()
vi.mock('@inquirer/prompts', () => ({
  input: (args: any) => mockInput(args),
  confirm: (args: any) => mockConfirm(args)
}))

const mockEnsureProductFiles = vi.fn()
const mockLoadBootstrapConfig = vi.fn()
const mockSaveBootstrapConfig = vi.fn()
vi.mock('../../src/file-state/FileStateManager', () => {
  return {
    FileStateManager: class {
      ensureProductFiles = mockEnsureProductFiles
      loadBootstrapConfig = mockLoadBootstrapConfig
      saveBootstrapConfig = mockSaveBootstrapConfig
    }
  }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false)
  }
})

const mockCmdRun = vi.fn()
vi.mock('../../src/cli/services/run-service', () => ({
  cmdRun: (cwd: string, args: string[]) => mockCmdRun(cwd, args)
}))

const mockCreateLocalSettings = vi.fn().mockReturnValue('/mock/cwd/.harness-kit/settings.json')
vi.mock('../../src/settings/HarnessSettings', () => ({
  HarnessSettings: {
    createLocalSettings: mockCreateLocalSettings
  }
}))

// Mock UI helpers to reduce noise
vi.mock('../../src/ui/StartupBanner', () => ({
  StartupBanner: { render: () => 'MOCK BANNER' }
}))
vi.mock('../../src/ui/AnsiHelpers', () => ({
  AnsiHelpers: {
    blue: (t: string) => t,
    green: (t: string) => t,
    cyan: (t: string) => t
  }
}))

describe('T29 — cmdInit', () => {
  const cwd = '/mock/cwd'

  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadBootstrapConfig.mockReturnValue({
      steeringRules: {}
    })
    mockInput.mockResolvedValue('') // Default empty rule
    mockConfirm.mockResolvedValue(false) // Don't run by default
  })

  it('creates product files via FileStateManager', async () => {
    await cmdInit(cwd, [])
    expect(mockEnsureProductFiles).toHaveBeenCalled()
  })

  it('collects rules and merges with defaults', async () => {
    mockInput.mockImplementation(async (args) => {
      if (args.message.includes('[Global (user)]')) return 'my global rule'
      if (args.message.includes('[Phase A (Planning)]')) return 'phase A rule'
      return ''
    })

    await cmdInit(cwd, [])

    expect(mockInput).toHaveBeenCalledTimes(6) // user, bootstrap, phase_a, phase_b, phase_c, phase_e
    expect(mockSaveBootstrapConfig).toHaveBeenCalled()
    const savedConfig = mockSaveBootstrapConfig.mock.calls[0][0]
    
    // Check that our custom rules were injected
    expect(savedConfig.steeringRules.user).toContain('my global rule')
    expect(savedConfig.steeringRules.phase_a).toContain('phase A rule')
    
    // Check that defaults were preserved (e.g. bootstrap granularity rule)
    expect(savedConfig.steeringRules.bootstrap[0]).toContain('Granularity rule')
  })

  it('creates local settings if user confirms', async () => {
    mockConfirm.mockResolvedValueOnce(true) // Create settings
    mockConfirm.mockResolvedValueOnce(false) // Run hrns run
    await cmdInit(cwd, [])
    expect(mockCreateLocalSettings).toHaveBeenCalledWith(cwd)
  })

  it('prompts to run hrns run at the end', async () => {
    mockConfirm.mockResolvedValueOnce(false) // Create settings
    mockConfirm.mockResolvedValueOnce(true) // Run hrns run
    await cmdInit(cwd, [])
    expect(mockCmdRun).toHaveBeenCalledWith(cwd, ['--reset'])
  })

  it('aborts early if product dir exists and user declines overwrite', async () => {
    const fs = await import('node:fs')
    // @ts-ignore
    fs.existsSync.mockReturnValueOnce(true)
    mockConfirm.mockResolvedValueOnce(false) // Decline overwrite

    await cmdInit(cwd, [])
    expect(mockEnsureProductFiles).not.toHaveBeenCalled()
  })
})
