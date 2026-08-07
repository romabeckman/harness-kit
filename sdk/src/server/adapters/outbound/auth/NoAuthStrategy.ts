import type { IAuthStrategy, AuthUserContext } from './types'

export class NoAuthStrategy implements IAuthStrategy {
  authenticate(_headers: Record<string, string | string[] | undefined>): AuthUserContext {
    return {
      authenticated: true,
      allowedProjects: ['*'],
    }
  }
}
