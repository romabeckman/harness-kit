import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileStateManager } from '../FileStateManager'

const rename = vi.hoisted(() => vi.fn())
vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, renameSync: rename }
})

describe('refinement atomic publication', () => {
  const directories: string[] = []
  afterEach(() => {
    vi.resetAllMocks()
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
  })

  it('preserves the prior refinement when replacement is denied', () => {
    const productDir = mkdtempSync(join(tmpdir(), 'refinement-atomic-'))
    directories.push(productDir)
    const path = join(productDir, 'REFINEMENT.md')
    writeFileSync(path, 'previous valid refinement')
    rename.mockImplementationOnce(() => { throw Object.assign(new Error('locked'), { code: 'EPERM' }) })

    expect(() => new FileStateManager({ productDir }).saveRefinement('candidate')).toThrow('locked')
    expect(readFileSync(path, 'utf8')).toBe('previous valid refinement')
    expect(readdirSync(productDir)).toEqual(['REFINEMENT.md'])
  })
})
