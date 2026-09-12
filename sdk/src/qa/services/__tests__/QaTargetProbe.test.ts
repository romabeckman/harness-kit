import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeQaTarget } from '../QaTargetProbe'

describe('probeQaTarget', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejects HTTP 404 responses as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })))

    await expect(probeQaTarget('http://127.0.0.1:8080/mcp')).resolves.toEqual({
      available: false,
      reason: 'Target unavailable at http://127.0.0.1:8080/mcp: HTTP 404',
    })
  })

  it('rejects HTTP 500 responses as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('server error', { status: 500 })))

    await expect(probeQaTarget('http://127.0.0.1:8080/mcp')).resolves.toEqual({
      available: false,
      reason: 'Target unavailable at http://127.0.0.1:8080/mcp: HTTP 500',
    })
  })

  it('treats HTTP 405 as reachable when target does not implement HEAD', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 405 })))

    await expect(probeQaTarget('http://127.0.0.1:8080/mcp')).resolves.toEqual({ available: true })
  })

  it.each([401, 403])('treats protected HTTP %s responses as reachable', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })))
    await expect(probeQaTarget('http://127.0.0.1:8080/protected')).resolves.toEqual({ available: true })
  })

  it('treats a root HTTP 404 as reachable for API targets with relative routes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })))

    await expect(probeQaTarget('http://127.0.0.1:8080')).resolves.toEqual({ available: true })
  })
})
