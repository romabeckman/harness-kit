import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IAuthStrategy, AuthUserContext } from './types'

export class HmacAuthStrategy implements IAuthStrategy {
  constructor(private secret: string) {}

  authenticate(
    headers: Record<string, string | string[] | undefined>,
    rawBody?: string
  ): AuthUserContext {
    const signatureHeader =
      this.getHeaderString(headers, 'x-signature-256') ??
      this.getHeaderString(headers, 'x-hub-signature-256') ??
      this.getHeaderString(headers, 'x-signature')

    if (!signatureHeader || !rawBody) {
      return { authenticated: false }
    }

    const computedSig = HmacAuthStrategy.computeSignature(rawBody, this.secret)
    const normalizedSig = signatureHeader.startsWith('sha256=')
      ? signatureHeader
      : `sha256=${signatureHeader}`

    const bufA = Buffer.from(normalizedSig)
    const bufB = Buffer.from(computedSig)

    if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
      return { authenticated: false }
    }

    return {
      authenticated: true,
      allowedProjects: ['*'],
    }
  }

  static computeSignature(rawBody: string, secret: string): string {
    const hash = createHmac('sha256', secret).update(rawBody).digest('hex')
    return `sha256=${hash}`
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
