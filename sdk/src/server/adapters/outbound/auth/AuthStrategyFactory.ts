import type { IAuthStrategy, AuthConfig } from './types'
import { NoAuthStrategy } from './NoAuthStrategy'
import { BasicAuthStrategy } from './BasicAuthStrategy'
import { BearerAuthStrategy } from './BearerAuthStrategy'

export class AuthStrategyFactory {
  static create(config?: AuthConfig): IAuthStrategy {
    const rawMode = (config?.mode ?? process.env.AUTH_MODE ?? process.env.AUTH_STRATEGY ?? 'none').toLowerCase()

    if (rawMode === 'none' || rawMode === 'off' || rawMode === 'disabled') {
      return new NoAuthStrategy()
    }

    if (rawMode === 'basic') {
      const user = config?.basicUser ?? process.env.AUTH_BASIC_USER ?? 'admin'
      const pass = config?.basicPass ?? process.env.AUTH_BASIC_PASS ?? ''
      if (!pass) {
        console.warn('[HRNS Auth] AUTH_MODE is "basic" but AUTH_BASIC_PASS is empty.')
      }
      return new BasicAuthStrategy(user, pass)
    }

    if (rawMode === 'bearer' || rawMode === 'token' || rawMode === 'apikey') {
      const token = config?.bearerToken ?? process.env.AUTH_BEARER_TOKEN ?? process.env.API_KEY ?? ''
      if (!token) {
        console.warn('[HRNS Auth] AUTH_MODE is "bearer" but AUTH_BEARER_TOKEN / API_KEY is empty.')
      }
      return new BearerAuthStrategy(token)
    }

    return new NoAuthStrategy()
  }
}
