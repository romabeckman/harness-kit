import { timingSafeEqual } from 'node:crypto'
import type { IAuthStrategy, AuthUserContext } from './types'

export class BasicAuthStrategy implements IAuthStrategy {
  constructor(
    private expectedUser: string,
    private expectedPass: string
  ) {}

  authenticate(headers: Record<string, string | string[] | undefined>): AuthUserContext {
    const authHeader = this.getHeaderString(headers, 'authorization')
    if (!authHeader || !authHeader.toLowerCase().startsWith('basic ')) {
      return { authenticated: false }
    }

    const base64Credentials = authHeader.substring(6).trim()
    let credentials = ''
    try {
      credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
    } catch {
      return { authenticated: false }
    }

    const colonIndex = credentials.indexOf(':')
    if (colonIndex === -1) {
      return { authenticated: false }
    }

    const user = credentials.substring(0, colonIndex)
    const pass = credentials.substring(colonIndex + 1)

    const isValid = this.safeCompare(user, this.expectedUser) && this.safeCompare(pass, this.expectedPass)
    if (!isValid) {
      return { authenticated: false }
    }

    return {
      authenticated: true,
      userId: user,
      allowedProjects: ['*'],
    }
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
