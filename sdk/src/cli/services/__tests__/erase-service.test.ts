import { describe, expect, it, vi } from 'vitest'
import { cmdErase } from '../erase-service'
import type { ErasePreview, EraseResult } from '../../../agent-runner/erase/types'

const preview: ErasePreview = Object.freeze({
  planId: 'plan-1', target: 'codex', missing: Object.freeze([]),
  entries: Object.freeze([Object.freeze({ path: '/runtime/sessions/a.jsonl', root: '/runtime', kind: 'file' as const, bytes: 7, identity: '1:1' })]),
})

function dependencies(confirmed: boolean, result?: EraseResult) {
  const service = {
    discover: vi.fn(async () => preview),
    erase: vi.fn(async () => result ?? { status: 'erased' as const, deleted: [preview.entries[0]!.path], skipped: [], failed: [] }),
  }
  return {
    service,
    selectTarget: vi.fn(async () => 'codex' as const),
    confirm: vi.fn(async () => confirmed),
    write: vi.fn(),
    setExitCode: vi.fn(),
  }
}

describe('cmdErase', () => {
  it('renders exact preview and cancels without mutation when confirmation is false', async () => {
    const deps = dependencies(false)
    const result = await cmdErase([], deps)

    expect(result.status).toBe('cancelled')
    expect(deps.write).toHaveBeenCalledWith(expect.stringContaining(preview.entries[0]!.path))
    expect(deps.service.erase).not.toHaveBeenCalled()
    expect(deps.setExitCode).not.toHaveBeenCalled()
  })

  it('passes the same immutable preview to execution after affirmative confirmation', async () => {
    const deps = dependencies(true)
    await cmdErase([], deps)
    expect(deps.service.erase).toHaveBeenCalledWith(preview)
  })

  it('returns no-op without confirmation when discovery is empty', async () => {
    const deps = dependencies(true)
    deps.service.discover.mockResolvedValue({ ...preview, entries: Object.freeze([]), missing: Object.freeze(['/runtime']) })
    const result = await cmdErase([], deps)
    expect(result.status).toBe('noop')
    expect(deps.confirm).not.toHaveBeenCalled()
  })

  it('prints every partial failure and sets a non-zero exit code', async () => {
    const deps = dependencies(true, {
      status: 'partial', deleted: [], skipped: [],
      failed: [{ path: '/runtime/a', code: 'EACCES', message: 'denied' }, { path: '/runtime/b', code: 'EBUSY', message: 'busy' }],
    })
    await cmdErase([], deps)
    expect(deps.write).toHaveBeenCalledWith(expect.stringContaining('/runtime/a [EACCES]'))
    expect(deps.write).toHaveBeenCalledWith(expect.stringContaining('/runtime/b [EBUSY]'))
    expect(deps.setExitCode).toHaveBeenCalledWith(1)
  })
})
