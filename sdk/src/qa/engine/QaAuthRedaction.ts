import type { QaResolvedAuth } from '../auth/types'

export function redactSecrets(value: string, auth?: QaResolvedAuth): string {
  let redacted = value
  for (const secret of authSecretValues(auth)) redacted = redacted.split(secret).join('[REDACTED]')
  return redacted
}

export function authSecretValues(auth?: QaResolvedAuth): string[] {
  if (!auth) return []
  const values = new Set<string>()
  for (const value of Object.values(auth.headers)) add(values, value)
  for (const value of Object.values(auth.environment)) add(values, value)
  if (auth.basic) {
    add(values, auth.basic.password)
    add(values, `${auth.basic.username}:${auth.basic.password}`)
    add(values, Buffer.from(`${auth.basic.username}:${auth.basic.password}`).toString('base64'))
  }
  if (auth.cookie) {
    add(values, auth.cookie.value)
    add(values, `${auth.cookie.name}=${auth.cookie.value}`)
  }
  return [...values].sort((left, right) => right.length - left.length)
}

function add(values: Set<string>, value: string): void {
  if (value.length > 0) values.add(value)
}
