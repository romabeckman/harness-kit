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
    await fetch(target, { method: 'HEAD', signal: controller.signal })
    return { available: true }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'connection failed'
    return { available: false, reason: `Target unavailable at ${target}: ${detail}` }
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
