import { randomUUID } from 'node:crypto'
import { lstat, readdir, rename, rmdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import type { EraseFileSystem, EraseRemovalOutcome, EraseStat } from './types'

export interface NodeEraseFileSystemHooks {
  readonly beforeStage?: (path: string) => Promise<void>
}

export class NodeEraseFileSystem implements EraseFileSystem {
  constructor(private readonly hooks: NodeEraseFileSystemHooks = {}) {}

  async lstat(value: string): Promise<EraseStat | null> {
    try {
      const stat = await lstat(value, { bigint: true })
      return {
        kind: stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : 'file',
        bytes: Number(stat.size),
        identity: [stat.dev, stat.ino, stat.size, stat.mode, stat.mtimeNs].join(':'),
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async readDirectory(value: string): Promise<readonly string[]> {
    try {
      return (await readdir(value)).sort(comparePaths)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  unlink(value: string): Promise<void> {
    return unlink(value)
  }

  removeEmptyDirectory(value: string): Promise<void> {
    return rmdir(value)
  }

  async removeIfUnchanged(value: string, expected: EraseStat): Promise<EraseRemovalOutcome> {
    const staged = path.join(path.dirname(value), `.hrns-erase-${randomUUID()}`)
    await this.hooks.beforeStage?.(value)
    try {
      await rename(value, staged)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing'
      throw error
    }

    try {
      const current = await this.lstat(staged)
      if (!current || current.kind !== expected.kind || current.identity !== expected.identity) {
        await rename(staged, value)
        return 'changed'
      }
      if (expected.kind === 'directory') await this.removeEmptyDirectory(staged)
      else await this.unlink(staged)
      return 'deleted'
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOTEMPTY' || code === 'EEXIST') {
        await rename(staged, value)
        return 'not-empty'
      }
      await this.restoreAfterFailure(staged, value)
      throw error
    }
  }

  private async restoreAfterFailure(staged: string, value: string): Promise<void> {
    try {
      await rename(staged, value)
    } catch {
      // Preserve the original removal error. The staged path remains recoverable.
    }
  }
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
