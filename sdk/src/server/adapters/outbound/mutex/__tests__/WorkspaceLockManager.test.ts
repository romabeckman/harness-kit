import { describe, it, expect, beforeEach } from 'vitest'
import { WorkspaceLockManager } from '../WorkspaceLockManager'

describe('WorkspaceLockManager', () => {
  let lockManager: WorkspaceLockManager

  beforeEach(() => {
    lockManager = new WorkspaceLockManager()
  })

  it('UT-1.1.7: Single-tenant acquisition succeeds', async () => {
    const acquired = await lockManager.acquireLock('/workspace/project-a', 'job-1')
    expect(acquired).toBe(true)
    expect(await lockManager.isLocked('/workspace/project-a')).toBe(true)
    expect(await lockManager.getLockOwner('/workspace/project-a')).toBe('job-1')
  })

  it('UT-1.1.8: Collision rejection when workspace is already locked', async () => {
    await lockManager.acquireLock('/workspace/project-a', 'job-1')
    const secondAttempt = await lockManager.acquireLock('/workspace/project-a', 'job-2')
    expect(secondAttempt).toBe(false)
    expect(await lockManager.getLockOwner('/workspace/project-a')).toBe('job-1')
  })

  it('UT-1.1.9: Legitimate release unlocks workspace', async () => {
    await lockManager.acquireLock('/workspace/project-a', 'job-1')
    const released = await lockManager.releaseLock('/workspace/project-a', 'job-1')
    expect(released).toBe(true)
    expect(await lockManager.isLocked('/workspace/project-a')).toBe(false)
  })

  it('UT-1.1.10: Unauthorized release rejection from different jobId', async () => {
    await lockManager.acquireLock('/workspace/project-a', 'job-1')
    const unauthorizedRelease = await lockManager.releaseLock('/workspace/project-a', 'job-2')
    expect(unauthorizedRelease).toBe(false)
    expect(await lockManager.isLocked('/workspace/project-a')).toBe(true)
  })

  it('IT-2.1.4: Multi-threaded concurrency integrity with Promise.all', async () => {
    const results = await Promise.all([
      lockManager.acquireLock('/workspace/project-concurrent', 'job-a'),
      lockManager.acquireLock('/workspace/project-concurrent', 'job-b'),
      lockManager.acquireLock('/workspace/project-concurrent', 'job-c'),
    ])

    const successCount = results.filter(Boolean).length
    expect(successCount).toBe(1)
  })

  it('Normalizes relative and windows paths to canonical key', async () => {
    await lockManager.acquireLock('C:\\workspace\\project-x\\', 'job-win')
    expect(await lockManager.isLocked('C:/workspace/project-x')).toBe(true)
  })
})
