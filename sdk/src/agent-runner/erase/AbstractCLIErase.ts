import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { NodeEraseFileSystem } from './NodeEraseFileSystem'
import type {
  ApprovedRoot,
  EraseEntry,
  EraseEnvironment,
  EraseFailure,
  EraseFileSystem,
  EraseManifest,
  ErasePreview,
  EraseResult,
  EraseStat,
} from './types'

export abstract class AbstractCLIErase {
  protected readonly path: typeof path.posix
  protected readonly fileSystem: EraseFileSystem
  private readonly preparedPlans = new Map<string, ErasePreview>()

  constructor(protected readonly environment: EraseEnvironment, fileSystem: EraseFileSystem = new NodeEraseFileSystem()) {
    this.path = environment.platform === 'win32' ? path.win32 : path.posix
    this.fileSystem = fileSystem
  }

  abstract manifest(): EraseManifest

  async discover(): Promise<ErasePreview> {
    const manifest = this.validateManifest(this.manifest())
    const discovered = new Map<string, EraseEntry>()
    const missing = new Set<string>()
    const roots = new Map(manifest.roots.map(root => [root.id, root]))

    for (const root of manifest.roots) {
      await this.assertNoSymlinkAncestors(root.path, true)
      const rootStat = await this.fileSystem.lstat(root.path)
      if (!rootStat) missing.add(root.path)
      else if (rootStat.kind !== 'directory') throw new Error(`Approved root must be a directory: ${root.path}`)
    }

    for (const mapping of manifest.entries) {
      const root = roots.get(mapping.rootId)!
      if (missing.has(root.path)) continue
      const mappedPath = this.path.resolve(root.path, mapping.relativePath)
      await this.assertNoSymlinkAncestors(mappedPath, false)
      if (mapping.fileNamePattern) {
        const matched = await this.enumeratePattern(root, mappedPath, mapping.fileNamePattern, discovered)
        if (!matched) missing.add(this.path.join(mappedPath, mapping.fileNamePattern))
        continue
      }
      const stat = await this.fileSystem.lstat(mappedPath)
      if (!stat) {
        missing.add(mappedPath)
        continue
      }
      await this.enumerate(root, mappedPath, stat, discovered)
    }

    const entries = [...discovered.values()].sort((left, right) => comparePaths(left.path, right.path))
    const preview = Object.freeze({
      planId: randomUUID(),
      target: manifest.target,
      entries: Object.freeze(entries.map(entry => Object.freeze(entry))),
      missing: Object.freeze([...missing].sort(comparePaths)),
    })
    this.preparedPlans.set(preview.planId, preview)
    return preview
  }

  async erase(preview: ErasePreview): Promise<EraseResult> {
    const prepared = this.preparedPlans.get(preview.planId)
    if (prepared !== preview) throw new Error('Erase preview was not prepared by this adapter')
    this.preparedPlans.delete(preview.planId)

    const manifest = this.validateManifest(this.manifest())
    if (preview.target !== manifest.target) throw new Error('Erase preview target does not match adapter target')
    const roots = manifest.roots.map(root => root.path)
    const ordered = [...preview.entries].sort((left, right) => {
      const depth = pathDepth(right.path, this.path) - pathDepth(left.path, this.path)
      return depth || comparePaths(left.path, right.path)
    })
    const deleted: string[] = []
    const skipped: string[] = []
    const failed: EraseFailure[] = []

    for (const entry of ordered) {
      if (!roots.some(root => this.isContained(root, entry.path)) || !this.isContained(entry.root, entry.path)) {
        failed.push({ path: entry.path, code: 'EOUTSIDE', message: 'Confirmed entry is outside approved roots' })
        continue
      }
      try {
        await this.assertNoSymlinkAncestors(entry.path, false)
        const current = await this.fileSystem.lstat(entry.path)
        if (!current) {
          skipped.push(entry.path)
          continue
        }
        if (current.kind !== entry.kind) throw Object.assign(new Error('Confirmed entry kind changed'), { code: 'ESTALE' })
        if (entry.kind !== 'directory' && current.identity !== entry.identity) {
          throw Object.assign(new Error('Confirmed entry identity changed'), { code: 'ESTALE' })
        }
        const outcome = await this.fileSystem.removeIfUnchanged(entry.path, current)
        if (outcome === 'missing' || outcome === 'not-empty') skipped.push(entry.path)
        else if (outcome === 'changed') throw Object.assign(new Error('Confirmed entry identity changed'), { code: 'ESTALE' })
        else deleted.push(entry.path)
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException
        if (nodeError.code === 'ENOENT' || nodeError.code === 'ENOTEMPTY' || nodeError.code === 'EEXIST') {
          skipped.push(entry.path)
        } else {
          failed.push({ path: entry.path, code: nodeError.code ?? 'UNKNOWN', message: nodeError.message })
        }
      }
    }

    return Object.freeze({
      status: failed.length ? 'partial' : 'erased',
      deleted: Object.freeze(deleted),
      skipped: Object.freeze(skipped),
      failed: Object.freeze(failed.map(item => Object.freeze(item))),
    })
  }

  private async enumerate(root: ApprovedRoot, value: string, stat: EraseStat, entries: Map<string, EraseEntry>): Promise<void> {
    this.assertContained(root.path, value)
    entries.set(value, { path: value, root: root.path, kind: stat.kind, bytes: stat.bytes, identity: stat.identity })
    if (stat.kind !== 'directory') return
    for (const child of await this.fileSystem.readDirectory(value)) {
      const childPath = this.path.join(value, child)
      await this.assertNoSymlinkAncestors(childPath, false)
      const childStat = await this.fileSystem.lstat(childPath)
      if (childStat) await this.enumerate(root, childPath, childStat, entries)
    }
  }

  private async enumeratePattern(root: ApprovedRoot, directory: string, source: string, entries: Map<string, EraseEntry>): Promise<boolean> {
    const stat = await this.fileSystem.lstat(directory)
    if (!stat || stat.kind !== 'directory') return false
    const pattern = new RegExp(source)
    let matched = false
    for (const child of await this.fileSystem.readDirectory(directory)) {
      if (!pattern.test(child)) continue
      const childPath = this.path.join(directory, child)
      const childStat = await this.fileSystem.lstat(childPath)
      if (childStat && childStat.kind !== 'directory') {
        matched = true
        await this.enumerate(root, childPath, childStat, entries)
      }
    }
    return matched
  }

  private validateManifest(manifest: EraseManifest): EraseManifest {
    if (!manifest.roots.length) throw new Error('Erase manifest must have an approved root')
    const home = this.path.resolve(this.environment.homeDir)
    const rootIds = new Set<string>()
    const normalizedRoots: ApprovedRoot[] = []
    for (const root of manifest.roots) {
      const normalized = this.path.resolve(root.path)
      if (!root.id || rootIds.has(root.id) || !this.path.isAbsolute(root.path)) throw new Error('Invalid approved root')
      if (this.samePath(normalized, this.path.parse(normalized).root) || this.samePath(normalized, home)) throw new Error('Unsafe approved root')
      if (normalizedRoots.some(existing => this.isContained(existing.path, normalized) || this.isContained(normalized, existing.path))) {
        throw new Error('Overlapping approved roots are unsafe')
      }
      rootIds.add(root.id)
      normalizedRoots.push(Object.freeze({ id: root.id, path: normalized }))
    }
    for (const entry of manifest.entries) {
      if (!rootIds.has(entry.rootId)) throw new Error(`Mapped entry references unknown root: ${entry.rootId}`)
      if (!entry.relativePath || this.path.isAbsolute(entry.relativePath) || path.win32.isAbsolute(entry.relativePath) || path.posix.isAbsolute(entry.relativePath)) {
        throw new Error(`Invalid mapped entry: ${entry.relativePath}`)
      }
      const segments = entry.relativePath.split(/[\\/]/)
      if (segments.includes('..')) throw new Error(`Invalid mapped entry: ${entry.relativePath}`)
      if (entry.fileNamePattern && (entry.fileNamePattern.includes('/') || !entry.fileNamePattern.startsWith('^') || !entry.fileNamePattern.endsWith('$'))) {
        throw new Error(`Invalid mapped entry pattern: ${entry.fileNamePattern}`)
      }
    }
    return Object.freeze({ ...manifest, roots: Object.freeze(normalizedRoots) })
  }

  private async assertNoSymlinkAncestors(value: string, includeCandidate: boolean): Promise<void> {
    const resolved = this.path.resolve(value)
    const parsedRoot = this.path.parse(resolved).root
    const segments = this.path.relative(parsedRoot, resolved).split(this.path.sep).filter(Boolean)
    if (!includeCandidate) segments.pop()
    let current = parsedRoot
    for (const segment of segments) {
      current = this.path.join(current, segment)
      const stat = await this.fileSystem.lstat(current)
      if (!stat) return
      if (stat.kind === 'symlink') throw new Error(`Unsafe symbolic link in approved path: ${current}`)
    }
  }

  private assertContained(root: string, candidate: string): void {
    if (!this.isContained(root, candidate)) throw new Error(`Mapped entry escapes approved root: ${candidate}`)
  }

  private isContained(root: string, candidate: string): boolean {
    const relative = this.path.relative(this.canonicalPath(root), this.canonicalPath(candidate))
    return relative === '' || (!relative.startsWith(`..${this.path.sep}`) && relative !== '..' && !this.path.isAbsolute(relative))
  }

  private samePath(left: string, right: string): boolean {
    return this.canonicalPath(left) === this.canonicalPath(right)
  }

  private canonicalPath(value: string): string {
    const resolved = this.path.resolve(value)
    if (this.environment.platform !== 'win32') return resolved
    const withoutNamespace = resolved.startsWith('\\\\?\\UNC\\')
      ? `\\\\${resolved.slice(8)}`
      : resolved.startsWith('\\\\?\\') ? resolved.slice(4) : resolved
    return this.path.resolve(withoutNamespace).toLowerCase()
  }
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function pathDepth(value: string, pathImpl: typeof path.posix): number {
  return value.split(pathImpl.sep).filter(Boolean).length
}
