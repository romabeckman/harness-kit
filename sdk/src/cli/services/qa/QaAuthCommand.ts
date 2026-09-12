import { QaAuthConfigStore } from '../../../qa/auth/QaAuthConfigStore'
import type { QaAuthMode } from '../../../qa/auth/types'

const MODES: QaAuthMode[] = ['none', 'basic', 'bearer', 'api-key', 'cookie']

export async function runQaAuthCommand(workspace: string): Promise<void> {
  const { input, select } = await import('@inquirer/prompts')
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

  const profileName = await input({
    message: 'Authentication profile name:',
    validate: (value) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) ? true : 'Use letters, numbers, dots, underscores, or hyphens; start with a letter or number.',
  })
  const profile: Record<string, unknown> = { mode }
  if (mode === 'basic') {
    profile.username = await input({ message: 'Basic username:', validate: nonEmpty('username') })
    profile.password = environmentReference(await input({ message: 'Basic password environment variable:', validate: environmentName }))
  } else if (mode === 'bearer') {
    profile.token = environmentReference(await input({ message: 'JWT/token environment variable:', validate: environmentName }))
  } else if (mode === 'api-key') {
    profile.header = await input({ message: 'API-key header name:', validate: headerName })
    profile.value = environmentReference(await input({ message: 'API-key environment variable:', validate: environmentName }))
  } else if (mode === 'cookie') {
    profile.name = await input({ message: 'Cookie name:', validate: nonEmpty('cookie name') })
    profile.value = environmentReference(await input({ message: 'Cookie value environment variable:', validate: environmentName }))
  }

  new QaAuthConfigStore(workspace).addProfile(profileName, profile)
  console.log(`Added QA authentication profile "${profileName}" (${mode}) to .harness-kit/auth.json.`)
}

function environmentReference(name: string): { source: 'env'; name: string } { return { source: 'env', name } }
function environmentName(value: string): true | string { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? true : 'Use a valid environment variable name.' }
function nonEmpty(field: string): (value: string) => true | string { return (value) => value.trim() ? true : `${field} must not be empty.` }
function headerName(value: string): true | string { return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value) ? true : 'Use a valid HTTP header name.' }
