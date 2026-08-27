import { AbstractCLIErase } from '../erase/AbstractCLIErase'
import { environmentPath, mapped, resolveEnvironmentPath } from '../erase/manifest-utils'
import type { EraseEnvironment, EraseFileSystem, EraseManifest } from '../erase/types'

const RUNTIME_ENTRIES = [
  'session-state', 'history-session-state', 'command-history-state', 'session-store.db',
  'session-store.db-shm', 'session-store.db-wal', 'logs', 'log', 'ide', 'plugin-data',
] as const

export class CopilotCLIErase extends AbstractCLIErase {
  constructor(environment: EraseEnvironment, fileSystem?: EraseFileSystem) {
    super(environment, fileSystem)
  }

  manifest(): EraseManifest {
    const pathImpl = environmentPath(this.environment)
    const runtime = resolveEnvironmentPath(this.environment, 'COPILOT_HOME', '.copilot')
    const cacheOverride = this.environment.variables.COPILOT_CACHE_HOME
    const cache = pathImpl.normalize(cacheOverride || (this.environment.platform === 'darwin'
      ? pathImpl.join(this.environment.homeDir, 'Library', 'Caches', 'copilot')
      : pathImpl.join(this.environment.variables.XDG_CACHE_HOME || pathImpl.join(this.environment.homeDir, '.cache'), 'copilot')))
    return Object.freeze({
      target: 'copilot',
      roots: Object.freeze([{ id: 'runtime', path: runtime }, { id: 'cache', path: cache }]),
      entries: Object.freeze([...mapped('runtime', RUNTIME_ENTRIES), { rootId: 'cache', relativePath: '.' }]),
    })
  }
}
