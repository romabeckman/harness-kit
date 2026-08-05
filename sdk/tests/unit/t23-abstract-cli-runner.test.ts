import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgentRunnerErrorCode } from '../../src/agent-runner/AgentRunnerError'
import { EventEmitter } from 'node:events'
import { Readable, Writable } from 'node:stream'

function makeChildMock(events: { name: string; arg: any; delay: number }[], stdoutChunks: string[] = [], stderrChunks: string[] = []) {
  const stdout = new Readable({ read() {} })
  const stderr = new Readable({ read() {} })
  const stdin = new Writable({ write(_, __, cb) { cb() } })
  const child = new EventEmitter() as any
  child.stdout = stdout
  child.stderr = stderr
  child.stdin = stdin
  child.kill = vi.fn()
  child.pid = 99999

  setTimeout(() => {
    for (const chunk of stdoutChunks) {
      stdout.push(chunk)
    }
    stdout.push(null)

    for (const chunk of stderrChunks) {
      stderr.push(chunk)
    }
    stderr.push(null)

    for (const e of events) {
      setTimeout(() => {
        child.emit(e.name, e.arg)
      }, e.delay)
    }
  }, 10)

  return child
}

describe('T23 — AbstractCliRunner', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.resetModules()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.doUnmock('cross-spawn')
  })

  it('TC-AB-01: buildPrompt constructs correct string representation', async () => {
    const { AbstractCliRunner } = await import('../../src/agent-runner/AbstractCliRunner.js')
    class TestCliRunner extends AbstractCliRunner {
      protected readonly binaryName = 'test-cli'
      protected buildArgs(prompt: string, invocation: any): string[] { return [] }
    }
    const runner = new TestCliRunner()
    const prompt = (runner as any).buildPrompt({
      skill: 'test-skill',
      mode: 'autonomous',
      payload: { key: 'value' }
    })
    expect(prompt).toContain('Skill: test-skill')
    expect(prompt).toContain('Mode: autonomous')
    expect(prompt).toContain('"key": "value"')
  })

  it('TC-AB-02: getModelName falls back to config or invocation model', async () => {
    const { AbstractCliRunner } = await import('../../src/agent-runner/AbstractCliRunner.js')
    class TestCliRunner extends AbstractCliRunner {
      protected readonly binaryName = 'test-cli'
      protected buildArgs(prompt: string, invocation: any): string[] { return [] }
      public exposeGetModelName(inv: any) { return this.getModelName(inv) }
    }
    const runnerWithModel = new TestCliRunner({ model: 'config-model' })
    expect(runnerWithModel.exposeGetModelName({ model: 'inv-model' })).toBe('config-model')

    const runnerWithoutModel = new TestCliRunner()
    expect(runnerWithoutModel.exposeGetModelName({ model: 'inv-model' })).toBe('inv-model')
  })

  it('TC-AB-02b: getEffort prioritizes runner config and cancels when empty string is passed', async () => {
    const { AbstractCliRunner } = await import('../../src/agent-runner/AbstractCliRunner.js')
    class TestCliRunner extends AbstractCliRunner {
      protected readonly binaryName = 'test-cli'
      protected buildArgs(prompt: string, invocation: any): string[] { return [] }
      public exposeGetEffort(inv: any) { return this.getEffort(inv) }
    }
    const runnerWithEmptyEffort = new TestCliRunner({ effort: '' })
    expect(runnerWithEmptyEffort.exposeGetEffort({ effort: 'high' })).toBeUndefined()

    const runnerWithEffort = new TestCliRunner({ effort: 'low' })
    expect(runnerWithEffort.exposeGetEffort({ effort: 'high' })).toBe('low')

    const runnerWithoutEffort = new TestCliRunner()
    expect(runnerWithoutEffort.exposeGetEffort({ effort: 'high' })).toBe('high')
    expect(runnerWithoutEffort.exposeGetEffort({ effort: '' })).toBeUndefined()
  })

  it('TC-AB-03: parseOutput default is empty object', async () => {
    const { AbstractCliRunner } = await import('../../src/agent-runner/AbstractCliRunner.js')
    class TestCliRunner extends AbstractCliRunner {
      protected readonly binaryName = 'test-cli'
      protected buildArgs(prompt: string, invocation: any): string[] { return [] }
      public exposeParseOutput(stdout: string, stderr: string, inv: any) { return this.parseOutput(stdout, stderr, inv) }
    }
    const runner = new TestCliRunner()
    const parsed = runner.exposeParseOutput('out', 'err', {})
    expect(parsed).toEqual({})
  })

  it('TC-AB-04: checkParsed default is null', async () => {
    const { AbstractCliRunner } = await import('../../src/agent-runner/AbstractCliRunner.js')
    class TestCliRunner extends AbstractCliRunner {
      protected readonly binaryName = 'test-cli'
      protected buildArgs(prompt: string, invocation: any): string[] { return [] }
      public exposeCheckParsed(parsed: any, inv: any) { return this.checkParsed(parsed, inv) }
    }
    const runner = new TestCliRunner()
    const err = runner.exposeCheckParsed({}, {})
    expect(err).toBeNull()
  })

  it('TC-AB-05: run rejects immediately if AbortSignal is already aborted', async () => {
    vi.doMock('cross-spawn', () => ({
      default: vi.fn(() => makeChildMock([], [], [])),
    }))

    const { AbstractCliRunner } = await import('../../src/agent-runner/AbstractCliRunner.js')
    class TestCliRunner extends AbstractCliRunner {
      protected readonly binaryName = 'test-cli'
      protected buildArgs(prompt: string, invocation: any): string[] { return [] }
    }
    const runner = new TestCliRunner()
    const controller = new AbortController()
    controller.abort()

    await expect(
      runner.run({ skill: 's', agent: 'a', mode: 'autonomous', payload: {} }, { signal: controller.signal })
    ).rejects.toThrow('aborted')
  })

  it('TC-AB-06: rejects with TIMEOUT error when timeout is reached', async () => {
    vi.doMock('cross-spawn', () => ({
      default: vi.fn(() => makeChildMock([], [], [])),
    }))

    const { AbstractCliRunner } = await import('../../src/agent-runner/AbstractCliRunner.js')
    class TestCliRunner extends AbstractCliRunner {
      protected readonly binaryName = 'test-cli'
      protected buildArgs(prompt: string, invocation: any): string[] { return [] }
    }
    const runner = new TestCliRunner()

    await expect(
      runner.run({ skill: 's', agent: 'a', mode: 'autonomous', payload: {}, timeoutMs: 5 })
    ).rejects.toThrow('timed out')
  })

  it('TC-AB-07: rejects with API_ERROR spawn code when spawn fails with non-ENOENT', async () => {
    const spawnErr = new Error('spawn failed') as any
    spawnErr.code = 'EACCES'

    vi.doMock('cross-spawn', () => ({
      default: vi.fn(() => {
        const child = new EventEmitter() as any
        child.stdout = new Readable({ read() {} })
        child.stderr = new Readable({ read() {} })
        child.stdin = new Writable({ write(_, __, cb) { cb() } })
        child.kill = vi.fn()
        setTimeout(() => child.emit('error', spawnErr), 5)
        return child
      }),
    }))

    const { AbstractCliRunner } = await import('../../src/agent-runner/AbstractCliRunner.js')
    class TestCliRunner extends AbstractCliRunner {
      protected readonly binaryName = 'test-cli'
      protected buildArgs(prompt: string, invocation: any): string[] { return [] }
    }
    const runner = new TestCliRunner()

    await expect(
      runner.run({ skill: 's', agent: 'a', mode: 'autonomous', payload: {} })
    ).rejects.toMatchObject({ code: AgentRunnerErrorCode.API_ERROR })
  })

  it('TC-AB-08: rejects with QUOTA_EXCEEDED when close code !== 0 and output contains rate limit', async () => {
    vi.doMock('cross-spawn', () => ({
      default: vi.fn(() => makeChildMock([{ name: 'close', arg: 1, delay: 20 }], [], ['rate limit exceeded'])),
    }))

    const { AbstractCliRunner } = await import('../../src/agent-runner/AbstractCliRunner.js')
    class TestCliRunner extends AbstractCliRunner {
      protected readonly binaryName = 'test-cli'
      protected buildArgs(prompt: string, invocation: any): string[] { return [] }
    }
    const runner = new TestCliRunner()

    await expect(
      runner.run({ skill: 's', agent: 'a', mode: 'autonomous', payload: {} })
    ).rejects.toMatchObject({ code: AgentRunnerErrorCode.QUOTA_EXCEEDED })
  })

  it('TC-AB-09: writes prompt to stdin if writePromptToStdin is true', async () => {
    let stdinContent = ''
    vi.doMock('cross-spawn', () => ({
      default: vi.fn(() => {
        const child = new EventEmitter() as any
        child.stdout = new Readable({ read() {} })
        child.stderr = new Readable({ read() {} })
        child.stdin = new Writable({
          write(chunk, _, cb) {
            stdinContent += chunk.toString()
            cb()
          }
        })
        child.kill = vi.fn()
        setTimeout(() => child.emit('close', 0), 10)
        return child
      }),
    }))

    const { AbstractCliRunner } = await import('../../src/agent-runner/AbstractCliRunner.js')
    class TestCliRunner extends AbstractCliRunner {
      protected readonly binaryName = 'test-cli'
      protected buildArgs(prompt: string, invocation: any): string[] { return [] }
      protected override get writePromptToStdin(): boolean { return true }
    }
    const runner = new TestCliRunner()

    await runner.run({ skill: 's', agent: 'a', mode: 'autonomous', payload: {}, prompt: 'write me to stdin' })
    expect(stdinContent).toBe('write me to stdin')
  })
})
