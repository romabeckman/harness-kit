import { AbstractCLIErase } from '../erase/AbstractCLIErase'
import { environmentPath, mapped } from '../erase/manifest-utils'
import type { EraseEnvironment, EraseFileSystem, EraseManifest } from '../erase/types'

const DATA_ENTRIES = [
  'storage', 'project', 'snapshot', 'tool-output', 'repos', 'sessions', 'log', 'logs',
  'opencode.db', 'opencode.db-shm', 'opencode.db-wal',
] as const

export class OpenCodeCLIErase extends AbstractCLIErase {
  constructor(environment: EraseEnvironment, fileSystem?: EraseFileSystem) {
    super(environment, fileSystem)
  }

  manifest(): EraseManifest {
    const pathImpl = environmentPath(this.environment)
    const dataBase = this.environment.variables.XDG_DATA_HOME || pathImpl.join(this.environment.homeDir, '.local', 'share')
    const cacheBase = this.environment.variables.XDG_CACHE_HOME || pathImpl.join(this.environment.homeDir, '.cache')
    const stateBase = this.environment.variables.XDG_STATE_HOME || pathImpl.join(this.environment.homeDir, '.local', 'state')
    const data = pathImpl.normalize(pathImpl.join(dataBase, 'opencode'))
    const cache = pathImpl.normalize(pathImpl.join(cacheBase, 'opencode'))
    const state = pathImpl.normalize(pathImpl.join(stateBase, 'opencode'))
    return Object.freeze({
      target: 'opencode',
      roots: Object.freeze([{ id: 'data', path: data }, { id: 'cache', path: cache }, { id: 'state', path: state }]),
      entries: Object.freeze([...mapped('data', DATA_ENTRIES), { rootId: 'cache', relativePath: '.' }, { rootId: 'state', relativePath: '.' }]),
    })
  }
}
