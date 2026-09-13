export interface QaTargetAvailability {
  available: boolean
  reason?: string
}

export type QaTargetProbe = (target: string, signal?: AbortSignal) => Promise<QaTargetAvailability>

export const probeQaTarget: QaTargetProbe = async (target, signal) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3_000)
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const targetUrl = new URL(target)
    const response = await fetch(target, { method: 'HEAD', signal: controller.signal })
    // Some MCP Streamable HTTP servers reject HEAD while still serving POST.
    // A root 404 can be valid for API targets whose scenarios use relative paths.
    // A path-specific 404 or any 5xx proves the configured target is unusable.
    const rootNotFound = response.status === 404 && targetUrl.pathname === '/'
    if (response.status >= 400 && ![401, 403, 405].includes(response.status) && !rootNotFound) {
      return { available: false, reason: `Target unavailable at ${target}: HTTP ${response.status}` }
    }
    return { available: true }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'connection failed'
    return { available: false, reason: `Target unavailable at ${target}: ${detail}` }
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
