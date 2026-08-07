export type AuthMode = 'none' | 'basic' | 'bearer' | 'token' | 'jwt' | 'oidc' | 'hmac'

export interface AuthUserContext {
  authenticated: boolean
  userId?: string
  clientId?: string
  scopes?: string[]
  allowedProjects?: string[]
}

export interface AuthConfig {
  mode?: AuthMode | string
  basicUser?: string
  basicPass?: string
  bearerToken?: string
  jwtSecret?: string
  jwksUri?: string
  issuer?: string
  audience?: string
  hmacSecret?: string
}

export interface IAuthStrategy {
  authenticate(
    headers: Record<string, string | string[] | undefined>,
    rawBody?: string
  ): Promise<AuthUserContext> | AuthUserContext
}
