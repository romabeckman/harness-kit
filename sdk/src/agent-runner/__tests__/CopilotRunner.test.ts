import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CopilotRunner } from '../copilot/CopilotRunner'
import { AgentRunnerRegistry } from '../AgentRunnerRegistry'
import { AgentRunnerFactory } from '../AgentRunnerFactory'

const { mockStart, mockStop, mockDestroy, mockSendAndWait, mockCreateSession } = vi.hoisted(() => {
  const mockStart = vi.fn().mockResolvedValue(undefined)
  const mockStop = vi.fn().mockResolvedValue(undefined)
  const mockDestroy = vi.fn().mockResolvedValue(undefined)
  const mockSendAndWait = vi.fn().mockResolvedValue({})
  const mockCreateSession = vi.fn().mockResolvedValue({
    sendAndWait: mockSendAndWait,
    destroy: mockDestroy,
  })
  return { mockStart, mockStop, mockDestroy, mockSendAndWait, mockCreateSession }
})

vi.mock('@github/copilot-sdk', () => {
  return {
    CopilotClient: class {
      start = mockStart
      stop = mockStop
      createSession = mockCreateSession
    },
    approveAll: vi.fn(),
  }
})

describe('CopilotRunner', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockStart.mockResolvedValue(undefined)
    mockStop.mockResolvedValue(undefined)
    mockDestroy.mockResolvedValue(undefined)
    mockSendAndWait.mockResolvedValue({})
    mockCreateSession.mockResolvedValue({
      sendAndWait: mockSendAndWait,
      destroy: mockDestroy,
    })
  })

  it('registers in global registry', () => {
    expect(AgentRunnerRegistry.has('copilot')).toBe(true)
    const runner = AgentRunnerFactory.create({ type: 'copilot' })
    expect(runner).toBeInstanceOf(CopilotRunner)
  })

  it('runs prompt via CopilotClient session', async () => {
    const runner = new CopilotRunner({ model: 'test-model' })
    const out = await runner.run({
      skill: 'test-skill',
      agent: 'test-agent',
      mode: 'autonomous',
      payload: { some: 'payload' },
    })

    expect(mockStart).toHaveBeenCalled()
    expect(mockCreateSession).toHaveBeenCalledWith({
      model: 'test-model',
      workingDirectory: process.cwd(),
      onPermissionRequest: expect.any(Function),
    })
    expect(mockSendAndWait).toHaveBeenCalledWith(
      {
        prompt: expect.stringContaining('test-skill'),
      },
      600_000
    )
    expect(mockDestroy).toHaveBeenCalled()
    expect(mockStop).toHaveBeenCalled()
    expect(out.success).toBe(true)
  })
})
