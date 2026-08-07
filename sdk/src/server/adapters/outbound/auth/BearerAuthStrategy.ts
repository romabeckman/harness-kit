import { timingSafeEqual } from 'node:crypto'
import type { IAuthStrategy, AuthUserContext } from './types'

export class BearerAuthStrategy implements IAuthStrategy {
  constructor(private expectedToken: string) {}

  authenticate(headers: Record<string, string | string[] | undefined>): AuthUserContext {
    const token = this.extractToken(headers)
    if (!token) {
      return { authenticated: false }
    }

    const isValid = this.safeCompare(token, this.expectedToken)
    if (!isValid) {
      return { authenticated: false }
    }

    return {
      authenticated: true,
      allowedProjects: ['*'],
    }
  }

  private extractToken(headers: Record<string, string | string[] | undefined>): string | null {
    const authHeader = this.getHeaderString(headers, 'authorization')
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.substring(7).trim()
    }

    const apiKeyHeader = this.getHeaderString(headers, 'x-api-key')
    if (apiKeyHeader && apiKeyHeader.trim().length > 0) {
      return apiKeyHeader.trim()
    }

    return null
  }

  private getHeaderString(
    headers: Record<string, string | string[] | undefined>,
    name: string
  ): string | undefined {
    const val = headers[name] ?? headers[name.toLowerCase()]
    if (Array.isArray(val)) return val[0]
    return val
  }

  private safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a)
    const bufB = Buffer.from(b)
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
  }
}
