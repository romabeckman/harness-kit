export interface QaTargetAvailability {
  available: boolean
  reason?: string
}

export type QaTargetProbe = (target: string, signal?: AbortSignal) => Promise<QaTargetAvailability>

const MAX_PROBE_ATTEMPTS = 3
const PROBE_RETRY_DELAY_MS = 100

export const probeQaTarget: QaTargetProbe = async (target, signal) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3_000)
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  let lastError: unknown
  try {
    const targetUrl = new URL(target)
    for (let attempt = 0; attempt < MAX_PROBE_ATTEMPTS; attempt++) {
      try {
        await fetch(target, { method: 'HEAD', signal: controller.signal })
        // An HTTP response proves the target is reachable; scenario drivers own status assertions.
        return { available: true }
      } catch (error) {
        lastError = error
        if (attempt + 1 < MAX_PROBE_ATTEMPTS) await delay(PROBE_RETRY_DELAY_MS)
      }
    }
  } catch (error) {
    lastError = error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
  const detail = lastError instanceof Error ? lastError.message : 'connection failed'
  return { available: false, reason: `Target unavailable at ${target}: ${detail}` }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
