import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeQaTarget } from '../QaTargetProbe'

describe('probeQaTarget', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('treats endpoint HTTP 404 as reachable so scenarios can verify route behavior', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })))

    await expect(probeQaTarget('http://127.0.0.1:8080/mcp')).resolves.toEqual({ available: true })
  })

  it('treats HTTP 500 as reachable so scenarios can inspect server failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('server error', { status: 500 })))

    await expect(probeQaTarget('http://127.0.0.1:8080/mcp')).resolves.toEqual({ available: true })
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

  it('retries transient connection failures before declaring the target unavailable', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('', { status: 405 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(probeQaTarget('http://127.0.0.1:8080')).resolves.toEqual({ available: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
