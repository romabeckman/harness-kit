import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AbstractCLIErase } from '../AbstractCLIErase'
import { NodeEraseFileSystem } from '../NodeEraseFileSystem'
import type { EraseEnvironment, EraseFileSystem, EraseManifest } from '../types'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'hrns-erase-'))
  temporaryDirectories.push(directory)
  return directory
}

class TestErase extends AbstractCLIErase {
  constructor(environment: EraseEnvironment, private readonly value: EraseManifest, fileSystem?: EraseFileSystem) {
    super(environment, fileSystem)
  }

  manifest(): EraseManifest {
    return this.value
  }
}

function manifest(root: string, relativePaths: string[]): EraseManifest {
  return {
    target: 'codex',
    roots: [{ id: 'runtime', path: root }],
    entries: relativePaths.map(relativePath => ({ rootId: 'runtime', relativePath })),
  }
}

function environment(homeDir: string): EraseEnvironment {
  return { platform: process.platform, homeDir, variables: {} }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('AbstractCLIErase', () => {
  it.each(['../auth.json', '/auth.json'])('rejects unsafe mapped entry %s before filesystem reads', async relativePath => {
    const homeDir = await temporaryDirectory()
    const root = path.join(homeDir, '.codex')
    const erase = new TestErase(environment(homeDir), manifest(root, [relativePath]))

    await expect(erase.discover()).rejects.toThrow(/mapped entry/i)
  })

  it('rejects the filesystem root and home directory as approved roots', async () => {
    const homeDir = await temporaryDirectory()
    await expect(new TestErase(environment(homeDir), manifest(path.parse(homeDir).root, ['sessions'])).discover()).rejects.toThrow(/approved root/i)
    await expect(new TestErase(environment(homeDir), manifest(homeDir, ['sessions'])).discover()).rejects.toThrow(/approved root/i)
  })

  it('discovers mapped descendants and empty directories in stable order while reporting missing mappings', async () => {
    const homeDir = await temporaryDirectory()
    const root = path.join(homeDir, '.codex')
    await mkdir(path.join(root, 'sessions', 'nested'), { recursive: true })
    await mkdir(path.join(root, 'cache', 'empty'), { recursive: true })
    await writeFile(path.join(root, 'sessions', 'nested', 'thread.jsonl'), 'history')
    await writeFile(path.join(root, 'auth.json'), 'secret')
    const erase = new TestErase(environment(homeDir), manifest(root, ['sessions', 'cache', 'missing.jsonl']))

    const preview = await erase.discover()

    expect(preview.entries.map(entry => path.relative(root, entry.path))).toEqual([
      'cache',
      path.join('cache', 'empty'),
      'sessions',
      path.join('sessions', 'nested'),
      path.join('sessions', 'nested', 'thread.jsonl'),
    ])
    expect(preview.missing).toEqual([path.join(root, 'missing.jsonl')])
    expect(preview.entries.some(entry => entry.path.endsWith('auth.json'))).toBe(false)
    expect(Object.isFrozen(preview)).toBe(true)
    expect(Object.isFrozen(preview.entries)).toBe(true)
  })

  it('returns an empty preview and one missing root when the runtime root is absent', async () => {
    const homeDir = await temporaryDirectory()
    const root = path.join(homeDir, '.codex')
    const preview = await new TestErase(environment(homeDir), manifest(root, ['sessions', 'history.jsonl'])).discover()

    expect(preview.entries).toEqual([])
    expect(preview.missing).toEqual([root])
  })

  it('accepts filename-only regex escapes and discovers matching root files non-recursively', async () => {
    const homeDir = await temporaryDirectory()
    const root = path.join(homeDir, '.codex')
    await mkdir(path.join(root, 'nested'), { recursive: true })
    await writeFile(path.join(root, 'state_1.sqlite-wal'), 'runtime')
    await writeFile(path.join(root, 'nested', 'state_2.sqlite-wal'), 'preserve')
    const value: EraseManifest = {
      target: 'codex', roots: [{ id: 'runtime', path: root }],
      entries: [{ rootId: 'runtime', relativePath: '.', fileNamePattern: '^state_.*\\.sqlite(?:-shm|-wal)?$' }],
    }

    const preview = await new TestErase(environment(homeDir), value).discover()

    expect(preview.entries.map(entry => entry.path)).toEqual([path.join(root, 'state_1.sqlite-wal')])
  })

  it('discovers and previews symlinks matching filename-only regex patterns without following them', async () => {
    const homeDir = 'C:\\Users\\sandbox'
    const root = 'C:\\Users\\sandbox\\.codex'
    const symlinkPath = path.join(root, 'state_1.sqlite-wal')

    const fileSystem: EraseFileSystem = {
      lstat: async targetPath => {
        if (targetPath === root) return { kind: 'directory', bytes: 0, identity: 'dir-1' }
        if (targetPath === symlinkPath) return { kind: 'symlink', bytes: 10, identity: 'symlink-1' }
        return null
      },
      readDirectory: async targetPath => {
        if (targetPath === root) return ['state_1.sqlite-wal']
        return []
      },
      unlink: async () => {},
      removeEmptyDirectory: async () => {},
      removeIfUnchanged: async () => 'deleted',
    }

    const value: EraseManifest = {
      target: 'codex', roots: [{ id: 'runtime', path: root }],
      entries: [{ rootId: 'runtime', relativePath: '.', fileNamePattern: '^state_.*\\.sqlite(?:-shm|-wal)?$' }],
    }

    const erase = new TestErase(environment(homeDir), value, fileSystem)
    const preview = await erase.discover()

    expect(preview.entries).toHaveLength(1)
    expect(preview.entries[0]?.path).toBe(symlinkPath)
    expect(preview.entries[0]?.kind).toBe('symlink')
  })

  it('does not recurse into a directory whose name matches a filename-only pattern', async () => {
    const homeDir = await temporaryDirectory()
    const root = path.join(homeDir, '.codex')
    const matchedDirectory = path.join(root, 'state_sensitive.sqlite')
    await mkdir(matchedDirectory, { recursive: true })
    await writeFile(path.join(matchedDirectory, 'credentials.json'), 'protected')
    const value: EraseManifest = {
      target: 'codex', roots: [{ id: 'runtime', path: root }],
      entries: [{ rootId: 'runtime', relativePath: '.', fileNamePattern: '^state_.*\\.sqlite$' }],
    }

    const preview = await new TestErase(environment(homeDir), value).discover()

    expect(preview.entries).toEqual([])
    expect(await readFile(path.join(matchedDirectory, 'credentials.json'), 'utf8')).toBe('protected')
  })

  it('previews and removes only a mapped symlink without following its external target', async () => {
    const homeDir = await temporaryDirectory()
    const root = path.join(homeDir, '.codex')
    const external = await temporaryDirectory()
    await mkdir(root, { recursive: true })
    await writeFile(path.join(external, 'credential.txt'), 'keep')
    await symlink(external, path.join(root, 'sessions'), process.platform === 'win32' ? 'junction' : 'dir')
    const erase = new TestErase(environment(homeDir), manifest(root, ['sessions']))

    const preview = await erase.discover()
    const result = await erase.erase(preview)

    expect(preview.entries).toHaveLength(1)
    expect(preview.entries[0]?.kind).toBe('symlink')
    expect(result.status).toBe('erased')
    expect(await readFile(path.join(external, 'credential.txt'), 'utf8')).toBe('keep')
  })

  it.each(['root', 'parent'] as const)('rejects a %s symlink before traversing mapped descendants', async symlinkLocation => {
    const homeDir = await temporaryDirectory()
    const external = await temporaryDirectory()
    const externalRuntime = symlinkLocation === 'root' ? external : path.join(external, 'runtime')
    await mkdir(path.join(externalRuntime, 'sessions'), { recursive: true })
    const protectedFile = path.join(externalRuntime, 'sessions', 'protected.jsonl')
    await writeFile(protectedFile, 'protected')

    let root: string
    if (symlinkLocation === 'root') {
      root = path.join(homeDir, '.codex')
      await symlink(externalRuntime, root, process.platform === 'win32' ? 'junction' : 'dir')
    } else {
      const linkedParent = path.join(homeDir, 'linked-parent')
      await symlink(external, linkedParent, process.platform === 'win32' ? 'junction' : 'dir')
      root = path.join(linkedParent, 'runtime')
    }
    const erase = new TestErase(environment(homeDir), manifest(root, ['sessions']))

    await expect(erase.discover()).rejects.toThrow(/symbolic link|symlink/i)
    expect(await readFile(protectedFile, 'utf8')).toBe('protected')
  })

  it('rejects a same-kind file replacement after preview and preserves replacement content', async () => {
    const homeDir = await temporaryDirectory()
    const root = path.join(homeDir, '.codex')
    const history = path.join(root, 'history.jsonl')
    await mkdir(root, { recursive: true })
    await writeFile(history, 'old')
    const erase = new TestErase(environment(homeDir), manifest(root, ['history.jsonl']))
    const preview = await erase.discover()
    await rm(history)
    await writeFile(history, 'protected replacement')

    const result = await erase.erase(preview)

    expect(result.status).toBe('partial')
    expect(result.deleted).toEqual([])
    expect(result.failed).toEqual([
      { path: history, code: 'ESTALE', message: 'Confirmed entry identity changed' },
    ])
    expect(await readFile(history, 'utf8')).toBe('protected replacement')
  })

  it('preserves a replacement installed after final lstat but before removal', async () => {
    const homeDir = await temporaryDirectory()
    const root = path.join(homeDir, '.codex')
    const history = path.join(root, 'history.jsonl')
    await mkdir(root, { recursive: true })
    await writeFile(history, 'old')
    const fileSystem = new NodeEraseFileSystem({
      beforeStage: async value => {
        await rm(value)
        await writeFile(value, 'protected replacement')
      },
    })
    const erase = new TestErase(environment(homeDir), manifest(root, ['history.jsonl']), fileSystem)
    const preview = await erase.discover()

    const result = await erase.erase(preview)

    expect(result.status).toBe('partial')
    expect(result.failed).toEqual([{ path: history, code: 'ESTALE', message: 'Confirmed entry identity changed' }])
    expect(await readFile(history, 'utf8')).toBe('protected replacement')
  })

  it('preserves an external file when the approved parent is swapped after validation', async () => {
    const homeDir = await temporaryDirectory()
    const root = path.join(homeDir, '.codex')
    const originalRoot = path.join(homeDir, '.codex-original')
    const external = await temporaryDirectory()
    const history = path.join(root, 'history.jsonl')
    const protectedFile = path.join(external, 'history.jsonl')
    await mkdir(root, { recursive: true })
    await writeFile(history, 'old')
    await writeFile(protectedFile, 'protected')
    const fileSystem = new NodeEraseFileSystem({
      beforeStage: async () => {
        await rename(root, originalRoot)
        await symlink(external, root, process.platform === 'win32' ? 'junction' : 'dir')
      },
    })
    const erase = new TestErase(environment(homeDir), manifest(root, ['history.jsonl']), fileSystem)
    const preview = await erase.discover()

    const result = await erase.erase(preview)

    expect(result.status).toBe('partial')
    expect(await readFile(protectedFile, 'utf8')).toBe('protected')
  })

  it('accepts an approved runtime override ending in a path separator', async () => {
    const homeDir = await temporaryDirectory()
    const root = path.join(homeDir, '.codex')
    await mkdir(path.join(root, 'sessions'), { recursive: true })
    await writeFile(path.join(root, 'sessions', 'thread.jsonl'), 'history')
    const erase = new TestErase(environment(homeDir), manifest(`${root}${path.sep}`, ['sessions']))

    const preview = await erase.discover()

    expect(preview.entries.some(entry => entry.path.endsWith('thread.jsonl'))).toBe(true)
  })

  it('rejects an existing approved root that is not a directory', async () => {
    const homeDir = await temporaryDirectory()
    const root = path.join(homeDir, '.copilot-cache')
    await writeFile(root, 'protected credential')

    await expect(new TestErase(environment(homeDir), manifest(root, ['.'])).discover()).rejects.toThrow(/approved root.*directory/i)
    expect(await readFile(root, 'utf8')).toBe('protected credential')
  })

  it('canonicalizes Windows namespace aliases before comparing an approved root with home', async () => {
    const homeDir = 'C:\\Users\\sandbox'
    const namespacedHome = '\\\\?\\C:\\Users\\sandbox'
    const windowsEnvironment: EraseEnvironment = { platform: 'win32', homeDir, variables: {} }

    await expect(new TestErase(windowsEnvironment, manifest(namespacedHome, ['projects'])).discover()).rejects.toThrow(/unsafe approved root/i)
  })

  it('deletes only the confirmed snapshot and preserves entries created after preview', async () => {
    const homeDir = await temporaryDirectory()
    const root = path.join(homeDir, '.codex')
    await mkdir(path.join(root, 'sessions'), { recursive: true })
    await writeFile(path.join(root, 'sessions', 'old.jsonl'), 'old')
    const erase = new TestErase(environment(homeDir), manifest(root, ['sessions']))
    const preview = await erase.discover()
    await writeFile(path.join(root, 'sessions', 'new.jsonl'), 'new')

    const result = await erase.erase(preview)

    expect(result.status).toBe('erased')
    expect(result.deleted).toEqual([path.join(root, 'sessions', 'old.jsonl')])
    expect(result.skipped).toEqual([path.join(root, 'sessions')])
    expect(await readFile(path.join(root, 'sessions', 'new.jsonl'), 'utf8')).toBe('new')
  })

  it('continues after removal errors and partitions deleted, skipped, and failed entries', async () => {
    const homeDir = await temporaryDirectory()
    const root = path.join(homeDir, '.codex')
    await mkdir(root, { recursive: true })
    for (const name of ['a.log', 'b.log', 'c.log']) await writeFile(path.join(root, name), name)
    const nodeFileSystem = new NodeEraseFileSystem()
    const fileSystem: EraseFileSystem = {
      lstat: value => nodeFileSystem.lstat(value),
      readDirectory: value => nodeFileSystem.readDirectory(value),
      unlink: async value => {
        if (value.endsWith('b.log')) throw Object.assign(new Error('denied'), { code: 'EACCES' })
        await nodeFileSystem.unlink(value)
      },
      removeEmptyDirectory: value => nodeFileSystem.removeEmptyDirectory(value),
      removeIfUnchanged: async (value, expected) => {
        if (value.endsWith('b.log')) throw Object.assign(new Error('denied'), { code: 'EACCES' })
        return nodeFileSystem.removeIfUnchanged(value, expected)
      },
    }
    const erase = new TestErase(environment(homeDir), manifest(root, ['a.log', 'b.log', 'c.log']), fileSystem)
    const preview = await erase.discover()
    await rm(path.join(root, 'c.log'))

    const result = await erase.erase(preview)

    expect(result.status).toBe('partial')
    expect(result.deleted).toEqual([path.join(root, 'a.log')])
    expect(result.skipped).toEqual([path.join(root, 'c.log')])
    expect(result.failed).toEqual([{ path: path.join(root, 'b.log'), code: 'EACCES', message: 'denied' }])
  })
})
