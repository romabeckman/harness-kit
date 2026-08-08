import type { IAuthStrategy, AuthConfig } from './types'
import { NoAuthStrategy } from './NoAuthStrategy'
import { BasicAuthStrategy } from './BasicAuthStrategy'
import { BearerAuthStrategy } from './BearerAuthStrategy'
import { JwtAuthStrategy } from './JwtAuthStrategy'
import { HmacAuthStrategy } from './HmacAuthStrategy'

export class AuthStrategyFactory {
  static create(config?: AuthConfig): IAuthStrategy {
    const rawMode = (config?.mode ?? process.env.AUTH_MODE ?? process.env.AUTH_STRATEGY ?? 'none').toLowerCase()

    if (rawMode === 'none' || rawMode === 'off' || rawMode === 'disabled') {
      console.warn('[HRNS Auth] NoAuthStrategy active — server has no authentication. Set AUTH_MODE to enable security.')
      return new NoAuthStrategy()
    }

    if (rawMode === 'basic') {
      const user = config?.basicUser ?? process.env.AUTH_BASIC_USER ?? 'admin'
      const pass = config?.basicPass ?? process.env.AUTH_BASIC_PASS ?? ''
      if (!pass) {
        throw new Error('[HRNS Auth] AUTH_MODE is "basic" but AUTH_BASIC_PASS is empty. Set AUTH_BASIC_PASS to a non-empty value.')
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

    if (rawMode === 'jwt' || rawMode === 'oidc') {
      const secret = config?.jwtSecret ?? process.env.AUTH_JWT_SECRET ?? ''
      const issuer = config?.issuer ?? process.env.AUTH_JWT_ISSUER ?? undefined
      const audience = config?.audience ?? process.env.AUTH_JWT_AUDIENCE ?? undefined
      if (!secret) {
        console.warn('[HRNS Auth] AUTH_MODE is "jwt" but AUTH_JWT_SECRET is empty.')
      }
      return new JwtAuthStrategy(secret, issuer, audience)
    }

    if (rawMode === 'hmac') {
      const secret = config?.hmacSecret ?? process.env.AUTH_HMAC_SECRET ?? ''
      if (!secret) {
        console.warn('[HRNS Auth] AUTH_MODE is "hmac" but AUTH_HMAC_SECRET is empty.')
      }
      return new HmacAuthStrategy(secret)
    }

    console.warn(`[HRNS Auth] Unrecognized AUTH_MODE "${rawMode}" — falling back to NoAuthStrategy (no authentication).`)
    return new NoAuthStrategy()
  }
}
