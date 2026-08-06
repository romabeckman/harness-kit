import { describe, it, expect, beforeEach } from 'vitest'
import { WorkspaceLockManager, releaseWorkspaceLock } from '../WorkspaceLockManager'

describe('WorkspaceLockManager', () => {
  let manager: WorkspaceLockManager

  beforeEach(() => {
    manager = new WorkspaceLockManager()
  })

  it('UT-1.1.7: should acquire lock for an un-locked workspace path', async () => {
    const path = '/workspace/target'
    const jobId = 'job-101'

    const acquired = await manager.acquire(path, jobId)

    expect(acquired).toBe(true)
    expect(await manager.isLocked(path)).toBe(true)
    expect(await manager.getLockOwner(path)).toBe(jobId)
  })

  it('UT-1.1.8: should reject lock acquisition when workspace is already locked', async () => {
    const path = '/workspace/target'
    await manager.acquire(path, 'job-101')

    const acquiredSecond = await manager.acquire(path, 'job-102')

    expect(acquiredSecond).toBe(false)
    expect(await manager.getLockOwner(path)).toBe('job-101')
  })

  it('UT-1.1.9: should release lock when invoked by legitimate lock owner', async () => {
    const path = '/workspace/target'
    const jobId = 'job-101'
    await manager.acquire(path, jobId)

    const released = await releaseWorkspaceLock(manager, path, jobId)

    expect(released).toBe(true)
    expect(await manager.isLocked(path)).toBe(false)
    expect(await manager.getLockOwner(path)).toBeNull()

    const reacquired = await manager.acquire(path, 'job-102')
    expect(reacquired).toBe(true)
  })

  it('UT-1.1.10: should reject lock release when invoked by non-owner jobId', async () => {
    const path = '/workspace/target'
    await manager.acquire(path, 'job-101')

    const released = await releaseWorkspaceLock(manager, path, 'job-999')

    expect(released).toBe(false)
    expect(await manager.isLocked(path)).toBe(true)
    expect(await manager.getLockOwner(path)).toBe('job-101')
  })

  it('IT-2.1.4: should guarantee single winner under simultaneous acquisition attempts', async () => {
    const path = '/workspace/shared'
    const attempts = Array.from({ length: 10 }, (_, i) => `job-${i + 1}`)

    const results = await Promise.all(
      attempts.map((jobId) => manager.acquireLock(path, jobId))
    )

    const successCount = results.filter((res) => res === true).length
    const failureCount = results.filter((res) => res === false).length

    expect(successCount).toBe(1)
    expect(failureCount).toBe(9)
    expect(await manager.isLocked(path)).toBe(true)
  })

  it('should normalize paths with different formats correctly', async () => {
    const pathA = '/workspace/project/./sub'
    const pathB = '/workspace/project/sub/'

    const acquiredA = await manager.acquire(pathA, 'job-1')
    expect(acquiredA).toBe(true)

    const acquiredB = await manager.acquire(pathB, 'job-2')
    expect(acquiredB).toBe(false)
  })
})
