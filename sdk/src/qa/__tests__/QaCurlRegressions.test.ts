import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import spawn from 'cross-spawn'
import { CurlDriver } from '../engine/CurlDriver'

vi.mock('cross-spawn', () => ({ default: vi.fn() }))

describe('curl contract regressions', () => {
  let workspace: string
  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'hrns-curl-regression-'))
    vi.mocked(spawn).mockImplementation(((_command: string, args: string[]) => {
      const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn() })
      queueMicrotask(() => {
        writeFileSync(args[args.indexOf('--output') + 1], JSON.stringify({ items: [{ id: 1, name: 'One' }, { id: 2 }] }))
        writeFileSync(args[args.indexOf('--dump-header') + 1], 'HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n')
        child.stdout.emit('data', Buffer.from('200'))
        child.emit('close', 0)
      })
      return child
    }) as unknown as typeof spawn)
  })
  afterEach(() => { vi.clearAllMocks(); rmSync(workspace, { recursive: true, force: true }) })

  it('compares JSON arrays structurally while preserving nested partial object checks', async () => {
    const result = await new CurlDriver().execute({ id: 'list', required: true, criterionIds: ['criterion-1'], profile: 'api',
      request: { method: 'GET', path: '/items', expectedStatus: 200, expectedJson: { items: [{ id: 1 }, { id: 2 }] } },
    }, 'http://qa.test', workspace)
    expect(result.status).toBe('PASSED')
  })

  it('keeps array order and length significant', async () => {
    const result = await new CurlDriver().execute({ id: 'list', required: true, criterionIds: ['criterion-1'], profile: 'api',
      request: { method: 'GET', path: '/items', expectedStatus: 200, expectedJson: { items: [{ id: 2 }] } },
    }, 'http://qa.test', workspace)
    expect(result.status).toBe('FAILED')
  })

  it('observes redirect responses without following another target', async () => {
    await new CurlDriver().execute({ id: 'redirect', required: true, criterionIds: ['criterion-1'], profile: 'api',
      request: { method: 'GET', path: '/', expectedStatus: 200 },
    }, 'http://qa.test', workspace)
    expect(vi.mocked(spawn).mock.calls[0][1]).not.toContain('--location')
  })

  it('does not spawn curl for an already cancelled scenario', async () => {
    const controller = new AbortController()
    controller.abort(new Error('Cancelled by user'))
    const result = await new CurlDriver().execute({ id: 'cancel', required: true, criterionIds: ['criterion-1'], profile: 'api',
      request: { method: 'GET', path: '/', expectedStatus: 200 },
    }, 'http://qa.test', workspace, controller.signal)
    expect(result.status).toBe('BLOCKED')
    expect(spawn).not.toHaveBeenCalled()
  })
})
