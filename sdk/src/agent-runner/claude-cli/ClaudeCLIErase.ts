import { AbstractCLIErase } from '../erase/AbstractCLIErase'
import { mapped, resolveEnvironmentPath } from '../erase/manifest-utils'
import type { EraseEnvironment, EraseFileSystem, EraseManifest } from '../erase/types'

const RUNTIME_ENTRIES = [
  'history.jsonl', 'projects', 'sessions', 'agent-memory', 'file-history', 'debug', 'log', 'logs',
  'session-env', 'shell-snapshots', 'ide', 'cache', 'image-cache', 'paste-cache', 'tsc-cache',
  'mcp-needs-auth-cache.json', 'statsig', 'usage-data', 'telemetry', 'plans', 'todos', 'tasks',
  'downloads', 'backups', '.update.lock', '.last-cleanup', '.last-update-result.json',
  'sessions.db', 'sessions.db-shm', 'sessions.db-wal',
] as const

export class ClaudeCLIErase extends AbstractCLIErase {
  constructor(environment: EraseEnvironment, fileSystem?: EraseFileSystem) {
    super(environment, fileSystem)
  }

  manifest(): EraseManifest {
    const root = resolveEnvironmentPath(this.environment, 'CLAUDE_CONFIG_DIR', '.claude')
    return Object.freeze({
      target: 'claude-code',
      roots: Object.freeze([{ id: 'runtime', path: root }]),
      entries: Object.freeze(mapped('runtime', RUNTIME_ENTRIES)),
    })
  }
}
