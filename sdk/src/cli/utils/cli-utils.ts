import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { existsSync, statSync } from 'node:fs'
import { AnsiHelpers } from '../../ui/AnsiHelpers'

export function printVersion(): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require('../../../package.json') as { version: string }
  console.log(`@romabeckman/hrns v${pkg.version}`)
}

export function expandPath(p: string): string {
  if (!p || p.trim() === '') return ''
  if (p === '~') return homedir()
  if (p.startsWith('~/') || p.startsWith('~\\')) return join(homedir(), p.slice(2))
  if (p.startsWith('/')) return p
  const fromHome = join(homedir(), p)
  if (existsSync(fromHome)) return fromHome
  return resolve(p)
}

export function resolveDirs(input: string): string[] {
  return input.split(',').map((p) => expandPath(p.trim())).filter((p) => p.trim().length > 0)
}

export function validateDirs(input: string): true | string {
  const paths = resolveDirs(input)
  if (paths.length === 0) return 'At least one path is required.'
  for (const abs of paths) {
    if (!existsSync(abs)) return `Path does not exist: ${abs}`
    if (!statSync(abs).isDirectory()) return `Not a directory: ${abs}`
  }
  return true
}

export function validateScope(scope: string): boolean | string {
  if (scope.trim() === '') {
    return AnsiHelpers.red('✗ Scope cannot be empty.')
  }

  if (scope.length < 20) {
    return AnsiHelpers.red('✗ Scope is too short. Please provide a more detailed description of the project.')
  }

  return true
}
