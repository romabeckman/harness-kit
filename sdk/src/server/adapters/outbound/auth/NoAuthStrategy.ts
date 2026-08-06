import type { IAuthStrategy } from './types'

export class NoAuthStrategy implements IAuthStrategy {
  authenticate(_headers: Record<string, string | string[] | undefined>): boolean {
    return true
  }
}
