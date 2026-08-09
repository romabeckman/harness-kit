import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IAuthStrategy, AuthUserContext } from './types'

export class JwtAuthStrategy implements IAuthStrategy {
  constructor(
    private secret: string,
    private expectedIssuer?: string,
    private expectedAudience?: string
  ) {}

  authenticate(headers: Record<string, string | string[] | undefined>): AuthUserContext {
    const authHeader = this.getHeaderString(headers, 'authorization')
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return { authenticated: false }
    }

    const token = authHeader.substring(7).trim()
    const payload = JwtAuthStrategy.verifyToken(token, this.secret)
    if (!payload) {
      return { authenticated: false }
    }

    if (this.expectedIssuer && payload.iss !== this.expectedIssuer) {
      return { authenticated: false }
    }

    if (this.expectedAudience && payload.aud !== this.expectedAudience) {
      return { authenticated: false }
    }

    const scopes = typeof payload.scope === 'string'
      ? payload.scope.split(' ')
      : (Array.isArray(payload.scope) ? payload.scope : [])

    const allowedProjects = Array.isArray(payload.allowed_projects)
      ? payload.allowed_projects
      : (typeof payload.allowed_projects === 'string' ? [payload.allowed_projects] : ['*'])

    return {
      authenticated: true,
      userId: typeof payload.sub === 'string' ? payload.sub : undefined,
      clientId: typeof payload.client_id === 'string' ? payload.client_id : undefined,
      scopes,
      allowedProjects,
    }
  }

  static signPayload(payload: Record<string, any>, secret: string): string {
    const header = { alg: 'HS256', typ: 'JWT' }
    const encHeader = Buffer.from(JSON.stringify(header)).toString('base64url')
    const encPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = createHmac('sha256', secret)
      .update(`${encHeader}.${encPayload}`)
      .digest('base64url')
    return `${encHeader}.${encPayload}.${signature}`
  }

  static verifyToken(token: string, secret: string): Record<string, any> | null {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [encHeader, encPayload, signature] = parts

    // Validate algorithm in header
    try {
      const headerStr = Buffer.from(encHeader, 'base64url').toString('utf-8')
      const header = JSON.parse(headerStr)
      if (!header.alg || header.alg !== 'HS256') {
        return null
      }
    } catch {
      return null
    }
    const expectedSig = createHmac('sha256', secret)
      .update(`${encHeader}.${encPayload}`)
      .digest('base64url')

    const bufA = Buffer.from(signature)
    const bufB = Buffer.from(expectedSig)
    if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
      return null
    }

    try {
      const payloadStr = Buffer.from(encPayload, 'base64url').toString('utf-8')
      const payload = JSON.parse(payloadStr)

      const now = Math.floor(Date.now() / 1000)
      if (typeof payload.exp === 'number' && now >= payload.exp) {
        return null
      }
      if (typeof payload.nbf === 'number' && now < payload.nbf) {
        return null
      }

      return payload
    } catch {
      return null
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
}
