export type EraseTarget = 'claude-code' | 'codex' | 'copilot' | 'antigravity' | 'opencode'

export interface EraseEnvironment {
  readonly platform: NodeJS.Platform
  readonly homeDir: string
  readonly variables: Readonly<Record<string, string | undefined>>
}

export interface ApprovedRoot {
  readonly id: string
  readonly path: string
}

export interface MappedEntry {
  readonly rootId: string
  readonly relativePath: string
  readonly fileNamePattern?: string
}

export interface EraseManifest {
  readonly target: EraseTarget
  readonly roots: readonly ApprovedRoot[]
  readonly entries: readonly MappedEntry[]
}

export type EraseEntryKind = 'file' | 'directory' | 'symlink'

export interface EraseEntry {
  readonly path: string
  readonly root: string
  readonly kind: EraseEntryKind
  readonly bytes: number
  readonly identity: string
}

export interface ErasePreview {
  readonly planId: string
  readonly target: EraseTarget
  readonly entries: readonly EraseEntry[]
  readonly missing: readonly string[]
}

export interface EraseFailure {
  readonly path: string
  readonly code: string
  readonly message: string
}

export interface EraseResult {
  readonly status: 'erased' | 'cancelled' | 'noop' | 'partial'
  readonly deleted: readonly string[]
  readonly skipped: readonly string[]
  readonly failed: readonly EraseFailure[]
}

export interface EraseStat {
  readonly kind: EraseEntryKind
  readonly bytes: number
  readonly identity: string
}

export type EraseRemovalOutcome = 'deleted' | 'missing' | 'changed' | 'not-empty'

export interface EraseFileSystem {
  lstat(path: string): Promise<EraseStat | null>
  readDirectory(path: string): Promise<readonly string[]>
  unlink(path: string): Promise<void>
  removeEmptyDirectory(path: string): Promise<void>
  removeIfUnchanged(path: string, expected: EraseStat): Promise<EraseRemovalOutcome>
}

export interface ProjectHistoryErasePort {
  discover(target: EraseTarget): Promise<ErasePreview>
  erase(preview: ErasePreview): Promise<EraseResult>
}
