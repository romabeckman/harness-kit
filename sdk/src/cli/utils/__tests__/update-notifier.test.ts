import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkForUpdates } from '../update-notifier'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('node:https', () => ({ get: mocks.get }))

describe('update notification', () => {
  let request: EventEmitter & { destroy: ReturnType<typeof vi.fn> }
  let response: EventEmitter & { statusCode: number; setEncoding: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    request = Object.assign(new EventEmitter(), { destroy: vi.fn() })
    response = Object.assign(new EventEmitter(), { statusCode: 200, setEncoding: vi.fn(), destroy: vi.fn() })
    mocks.get.mockReset().mockReturnValue(request)
    warn = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  function reply(body: string, status = 200) {
    response.statusCode = status
    mocks.get.mock.calls[0][1](response)
    response.emit('data', body)
    response.emit('end')
  }

  it('returns immediately and reports a newer version with an update command', () => {
    expect(checkForUpdates('0.9.3')).toBeUndefined()
    expect(mocks.get.mock.calls[0][0]).toBe('https://raw.githubusercontent.com/romabeckman/harness-kit/main/sdk/package.json')
    reply('{"version":"0.10.0"}')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('npm install -g @romabeckman/hrns@latest'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('0.9.3 → 0.10.0'))
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['0.9.3', '0.9.2', '0.8.99', 'invalid', '\u001b[31m', null])('ignores equal, older or invalid version %s', version => {
    checkForUpdates('0.9.3')
    reply(JSON.stringify({ version }))
    expect(warn).not.toHaveBeenCalled()
  })

  it.each(['not json', '{}', 'null'])('ignores invalid payload %s', body => {
    checkForUpdates('0.9.3')
    expect(() => reply(body)).not.toThrow()
    expect(warn).not.toHaveBeenCalled()
  })

  it('ignores HTTP errors', () => {
    checkForUpdates('0.9.3')
    reply('{"version":"99.0.0"}', 503)
    expect(warn).not.toHaveBeenCalled()
  })

  it('swallows synchronous and asynchronous network failures', () => {
    mocks.get.mockImplementationOnce(() => { throw new Error('offline') })
    expect(() => checkForUpdates('0.9.3')).not.toThrow()
    checkForUpdates('0.9.3')
    expect(() => request.emit('error', new Error('offline'))).not.toThrow()
    expect(warn).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('unrefs the socket and cancels a stalled request within 1500ms', () => {
    checkForUpdates('0.9.3')
    const socket = { unref: vi.fn() }
    request.emit('socket', socket)
    expect(socket.unref).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1500)
    expect(request.destroy).toHaveBeenCalledOnce()
    reply('{"version":"99.0.0"}')
    expect(warn).not.toHaveBeenCalled()
  })

  it('handles response errors and rejects oversized bodies', () => {
    checkForUpdates('0.9.3')
    mocks.get.mock.calls[0][1](response)
    expect(() => response.emit('error', new Error('reset'))).not.toThrow()
    expect(warn).not.toHaveBeenCalled()
    checkForUpdates('0.9.3')
    mocks.get.mock.calls[1][1](response)
    response.emit('data', 'x'.repeat(65537))
    expect(request.destroy).toHaveBeenCalled()
  })
})
