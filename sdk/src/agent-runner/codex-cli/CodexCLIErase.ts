import { AbstractCLIErase } from '../erase/AbstractCLIErase'
import { mapped, mappedPattern, resolveEnvironmentPath } from '../erase/manifest-utils'
import type { EraseEnvironment, EraseFileSystem, EraseManifest } from '../erase/types'

const RUNTIME_ENTRIES = [
  'history.jsonl', 'session_index.jsonl', 'sessions', 'archived_sessions', 'log', 'logs', 'cache',
  'models_cache.json', 'shell_snapshots', 'thread-writer-locks', '.tmp', 'tmp', 'installation_id',
  'version.json', '.sandbox_migration',
] as const

const SQLITE_PATTERNS = [
  '^thread_history_.*\\.sqlite(?:-shm|-wal)?$', '^state_.*\\.sqlite(?:-shm|-wal)?$',
  '^memories_.*\\.sqlite(?:-shm|-wal)?$', '^goals_.*\\.sqlite(?:-shm|-wal)?$',
  '^queue_.*\\.sqlite(?:-shm|-wal)?$', '^logs_.*\\.sqlite(?:-shm|-wal)?$',
] as const

export class CodexCLIErase extends AbstractCLIErase {
  constructor(environment: EraseEnvironment, fileSystem?: EraseFileSystem) {
    super(environment, fileSystem)
  }

  manifest(): EraseManifest {
    const root = resolveEnvironmentPath(this.environment, 'CODEX_HOME', '.codex')
    return Object.freeze({
      target: 'codex',
      roots: Object.freeze([{ id: 'runtime', path: root }]),
      entries: Object.freeze([
        ...mapped('runtime', RUNTIME_ENTRIES),
        ...SQLITE_PATTERNS.map(pattern => mappedPattern('runtime', '.', pattern)),
      ]),
    })
  }
}
