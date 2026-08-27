import type { AbstractCLIErase } from './AbstractCLIErase'
import type { EraseTarget } from './types'

export class UnsupportedEraseTargetError extends Error {
  constructor(readonly target: string) {
    super(`Unsupported erase target: ${target}`)
    this.name = 'UnsupportedEraseTargetError'
  }
}

export class CLIEraseRegistry {
  private readonly adapters = new Map<EraseTarget, AbstractCLIErase>()

  register(target: EraseTarget, adapter: AbstractCLIErase): this {
    this.adapters.set(target, adapter)
    return this
  }

  get(target: EraseTarget): AbstractCLIErase {
    const adapter = this.adapters.get(target)
    if (!adapter) throw new UnsupportedEraseTargetError(target)
    return adapter
  }
}
