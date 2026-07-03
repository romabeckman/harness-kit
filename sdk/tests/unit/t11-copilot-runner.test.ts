import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CopilotSDKRunner } from '../../src/agent-runner/copilot-sdk/CopilotSDKRunner'

const startMock = vi.fn()
const stopMock = vi.fn()
const createSessionMock = vi.fn()
const sendAndWaitMock = vi.fn()
const disconnectMock = vi.fn()
const destroyMock = vi.fn()

const mockClientConstructor = vi.fn()

vi.mock('@github/copilot-sdk', () => {
  return {
    CopilotClient: vi.fn().mockImplementation(function (options) {
      mockClientConstructor(options)
      return {
        start: startMock,
        stop: stopMock,
        createSession: createSessionMock,
      }
    }),
    approveAll: () => { },
  }
})

describe('CopilotSDKRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    startMock.mockResolvedValue(undefined)
    stopMock.mockResolvedValue([])
    createSessionMock.mockResolvedValue({
      sessionId: 'test-session-id',
      sendAndWait: sendAndWaitMock.mockResolvedValue({
        type: 'assistant.message',
        data: { content: 'test response' },
      }),
      disconnect: disconnectMock.mockResolvedValue(undefined),
      destroy: destroyMock.mockResolvedValue(undefined),
    })
  })

  it('initializes CopilotClient with workingDirectory and env, and creates session without workingDirectory', async () => {
    const runner = new CopilotSDKRunner({ model: 'gpt-5' })
    const invocation = {
      skill: 'test-skill',
      agent: 'test-agent',
      mode: 'autonomous' as const,
      payload: {},
      prompt: 'hello',
      workspacePath: '/mock/workspace',
      env: { TEST_ENV: 'value' },
    }

    await runner.run(invocation)

    const { CopilotClient } = await import('@github/copilot-sdk')
    expect(CopilotClient).toHaveBeenCalledWith({
      workingDirectory: '/mock/workspace',
      env: { TEST_ENV: 'value' },
    })

    expect(createSessionMock).toHaveBeenCalledWith({
      model: 'gpt-5',
      onPermissionRequest: expect.any(Function),
    })

    expect(disconnectMock).toHaveBeenCalled()
    expect(destroyMock).not.toHaveBeenCalled()
  })
})
