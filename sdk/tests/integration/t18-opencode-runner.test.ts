import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mock @opencode-ai/sdk before any imports ─────────────────────────────────
// Must be declared at top level for vi.mock hoisting
const mockServerStop = vi.fn().mockResolvedValue(undefined)
const mockServer = { url: 'http://localhost:9999', stop: mockServerStop }
const mockSessionCreate = vi.fn().mockResolvedValue({ data: { id: 'session-abc-123' } })
const mockSessionPrompt = vi.fn().mockResolvedValue({ data: { output: 'opencode agent response' } })
const mockClient = { session: { create: mockSessionCreate, prompt: mockSessionPrompt } }
const mockCreateOpencode = vi.fn().mockResolvedValue({ server: mockServer })
const mockCreateOpencodeClient = vi.fn().mockReturnValue(mockClient)

vi.mock('@opencode-ai/sdk', () => ({
  createOpencode: mockCreateOpencode,
  createOpencodeClient: mockCreateOpencodeClient,
}))

describe('OpenCodeRunner — TC-OC', () => {
  beforeEach(async () => {
    // Reset all mock call counts between tests
    vi.clearAllMocks()
    mockCreateOpencode.mockResolvedValue({ server: mockServer })
    mockCreateOpencodeClient.mockReturnValue(mockClient)
    mockSessionCreate.mockResolvedValue({ data: { id: 'session-abc-123' } })
    mockSessionPrompt.mockResolvedValue({ data: { output: 'opencode agent response' } })
    mockServerStop.mockResolvedValue(undefined)

    // Ensure OpenCodeRunner is imported and registered
    await import('../../src/agent-runner/opencode/OpenCodeRunner')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // TC-OC-04: self-registers as 'opencode'
  it('TC-OC-04: self-registers as "opencode" on import', async () => {
    const { AgentRunnerRegistry } = await import('../../src/agent-runner/AgentRunnerRegistry')
    expect(AgentRunnerRegistry.has('opencode')).toBe(true)
  })

  // TC-OC-01: session created and prompt delivered
  it('TC-OC-01: creates session and delivers prompt via SDK', async () => {
    const { OpenCodeRunner } = await import('../../src/agent-runner/opencode/OpenCodeRunner')

    const runner = new OpenCodeRunner({ model: 'anthropic/claude-sonnet-4-20250514' })
    const output = await runner.run({
      agent: 'software-architect',
      mode: 'autonomous',
      payload: {},
      prompt: 'explain codebase',
    })

    // createOpencode called to start local server
    expect(mockCreateOpencode).toHaveBeenCalled()

    // createOpencodeClient called with server URL
    expect(mockCreateOpencodeClient).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'http://localhost:9999' }),
    )

    // session.create() called
    expect(mockSessionCreate).toHaveBeenCalled()

    // session.prompt() called with correct text
    expect(mockSessionPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.objectContaining({ id: 'session-abc-123' }),
        body: expect.objectContaining({
          parts: expect.arrayContaining([
            expect.objectContaining({ type: 'text', text: 'explain codebase' }),
          ]),
        }),
      }),
    )

    expect(output.raw).toContain('opencode agent response')
    expect(output.success).toBe(true)
  })

  // TC-OC-02: local server stopped after completion
  it('TC-OC-02: stops local server after successful run()', async () => {
    const { OpenCodeRunner } = await import('../../src/agent-runner/opencode/OpenCodeRunner')

    const runner = new OpenCodeRunner()
    await runner.run({
      agent: 'software-architect',
      mode: 'autonomous',
      payload: {},
      prompt: 'write tests',
    })

    expect(mockServerStop).toHaveBeenCalled()
  })

  it('TC-OC-01b: builds prompt from payload when prompt is not explicit', async () => {
    const { OpenCodeRunner } = await import('../../src/agent-runner/opencode/OpenCodeRunner')

    const runner = new OpenCodeRunner()
    const output = await runner.run({
      agent: 'software-architect',
      mode: 'autonomous',
      payload: { scope: 'refactor auth', domain: 'auth' },
      // No explicit prompt — should serialize payload
    })

    // Verify prompt sent to session contained the payload
    const promptCall = mockSessionPrompt.mock.calls[0][0]
    const sentText = promptCall.body.parts[0].text as string
    expect(sentText).toContain('refactor auth')
    expect(output.success).toBe(true)
  })

  // TC-OC-03: AbortSignal stops local server and rejects
  it('TC-OC-03: AbortSignal rejects run() and stops server', async () => {
    const controller = new AbortController()

    // Make session.prompt trigger the abort and then hang
    mockSessionPrompt.mockImplementation(() => {
      controller.abort()
      return new Promise((_resolve, _reject) => {
        // deliberately hangs — will be aborted
      })
    })

    const { OpenCodeRunner } = await import('../../src/agent-runner/opencode/OpenCodeRunner')
    const runner = new OpenCodeRunner()

    const runPromise = runner.run(
      { agent: 'dev', mode: 'autonomous', payload: {}, prompt: 'long task' },
      { signal: controller.signal },
    )

    await expect(runPromise).rejects.toThrow()
    expect(mockServerStop).toHaveBeenCalled()
  })

  it('TC-OC-validateConfig: no API key required by SDK runner (no validateConfig)', async () => {
    // OpenCodeRunner deliberately has no validateConfig — SDK reads env vars internally
    const { AgentRunnerRegistry } = await import('../../src/agent-runner/AgentRunnerRegistry')
    const reg = AgentRunnerRegistry.get('opencode')
    expect(reg).toBeDefined()
    expect(reg!.validateConfig).toBeUndefined()
  })
})
