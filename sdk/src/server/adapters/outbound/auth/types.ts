export type AuthMode = 'none' | 'basic' | 'bearer' | 'token'

export interface AuthConfig {
  mode?: AuthMode | string
  basicUser?: string
  basicPass?: string
  bearerToken?: string
}

export interface IAuthStrategy {
  authenticate(headers: Record<string, string | string[] | undefined>): boolean
}
