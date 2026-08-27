import { AbstractCLIErase } from '../erase/AbstractCLIErase'
import { environmentPath, mapped, mappedPattern } from '../erase/manifest-utils'
import type { EraseEnvironment, EraseFileSystem, EraseManifest } from '../erase/types'

const RUNTIME_ENTRIES = [
  'conversations', 'brain', 'implicit', 'history.jsonl', 'cache', 'log', 'logs', 'scratch', 'tmp', '.tmp',
] as const

export class AntigravityCLIErase extends AbstractCLIErase {
  constructor(environment: EraseEnvironment, fileSystem?: EraseFileSystem) {
    super(environment, fileSystem)
  }

  manifest(): EraseManifest {
    const pathImpl = environmentPath(this.environment)
    const geminiHome = pathImpl.normalize(this.environment.variables.GEMINI_HOME || pathImpl.join(this.environment.homeDir, '.gemini'))
    const runtime = pathImpl.normalize(this.environment.variables.AGY_HOME || pathImpl.join(geminiHome, 'antigravity-cli'))
    return Object.freeze({
      target: 'antigravity',
      roots: Object.freeze([{ id: 'runtime', path: runtime }]),
      entries: Object.freeze([
        ...mapped('runtime', RUNTIME_ENTRIES),
        mappedPattern('runtime', '.', '^.*\\.(?:db|sqlite)-(?:wal|shm)$'),
      ]),
    })
  }
}
