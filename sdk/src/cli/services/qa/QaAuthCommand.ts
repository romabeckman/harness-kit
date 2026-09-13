import { QaAuthConfigStore } from '../../../qa/auth/QaAuthConfigStore'
import type { QaAuthMode } from '../../../qa/auth/types'

const MODES: QaAuthMode[] = ['none', 'basic', 'bearer', 'api-key', 'cookie']
type QaAuthStorage = 'env' | 'insecure'

export async function runQaAuthCommand(workspace: string): Promise<void> {
  const { confirm, input, password, select } = await import('@inquirer/prompts')
  const mode = await select({
    message: 'Authentication mode:',
    choices: [
      { name: 'none — anonymous requests', value: 'none' },
      { name: 'basic — username and password', value: 'basic' },
      { name: 'bearer — JWT/token header', value: 'bearer' },
      { name: 'api-key — custom header', value: 'api-key' },
      { name: 'cookie — session cookie', value: 'cookie' },
    ],
  }) as QaAuthMode
  if (!MODES.includes(mode)) throw new Error(`Invalid QA authentication mode: ${mode}`)

  const storage = mode === 'none' ? 'env' : await select({
    message: 'Credential storage:',
    choices: [
      { name: 'env — save only an environment-variable reference', value: 'env' },
      { name: 'insecure — save the entered secret directly in auth.json', value: 'insecure' },
    ],
  }) as QaAuthStorage
  if (storage === 'insecure') {
    console.warn('WARNING: insecure storage writes credentials directly to .harness-kit/auth.json. Protect this file and do not commit it.')
    const accepted = await confirm({ message: 'Continue with insecure credential storage?', default: false })
    if (!accepted) throw new Error('Insecure credential storage cancelled')
  }

  const profileName = await input({
    message: 'Authentication profile name:',
    validate: (value) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) ? true : 'Use letters, numbers, dots, underscores, or hyphens; start with a letter or number.',
  })
  const profile: Record<string, unknown> = { mode }
  if (storage === 'insecure') profile.storage = 'insecure'
  if (mode === 'basic') {
    profile.username = await input({ message: 'Basic username:', validate: nonEmpty('username') })
    profile.password = await secret(storage, 'Basic password', 'Basic password environment variable', input, password)
  } else if (mode === 'bearer') {
    profile.token = await secret(storage, 'JWT/token', 'JWT/token environment variable', input, password)
  } else if (mode === 'api-key') {
    profile.header = await input({ message: 'API-key header name:', validate: headerName })
    profile.value = await secret(storage, 'API-key value', 'API-key environment variable', input, password)
  } else if (mode === 'cookie') {
    profile.name = await input({ message: 'Cookie name:', validate: nonEmpty('cookie name') })
    profile.value = await secret(storage, 'Cookie value', 'Cookie value environment variable', input, password)
  }

  new QaAuthConfigStore(workspace).addProfile(profileName, profile)
  console.log(`Added QA authentication profile "${profileName}" (${mode}) to .harness-kit/auth.json.`)
}

async function secret(
  storage: QaAuthStorage,
  secretLabel: string,
  environmentLabel: string,
  input: (options: { message: string; validate?: (value: string) => true | string }) => Promise<string>,
  password: (options: { message: string; mask: string; validate?: (value: string) => true | string }) => Promise<string>,
): Promise<{ source: 'env'; name: string } | { source: 'literal'; value: string }> {
  if (storage === 'insecure') return { source: 'literal', value: await password({ message: `${secretLabel}:`, mask: '*', validate: nonEmpty('secret') }) }
  return { source: 'env', name: await input({ message: `${environmentLabel}:`, validate: environmentName }) }
}
function environmentName(value: string): true | string { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? true : 'Use a valid environment variable name.' }
function nonEmpty(field: string): (value: string) => true | string { return (value) => value.trim() ? true : `${field} must not be empty.` }
function headerName(value: string): true | string { return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value) ? true : 'Use a valid HTTP header name.' }
