import path from 'node:path'
import type { EraseEnvironment, MappedEntry } from './types'

export function environmentPath(environment: EraseEnvironment): typeof path.posix {
  return environment.platform === 'win32' ? path.win32 : path.posix
}

export function resolveEnvironmentPath(environment: EraseEnvironment, variable: string, ...fallback: string[]): string {
  const pathImpl = environmentPath(environment)
  const configured = environment.variables[variable]
  return pathImpl.resolve(configured || pathImpl.join(environment.homeDir, ...fallback))
}

export function mapped(rootId: string, paths: readonly string[]): MappedEntry[] {
  return paths.map(relativePath => Object.freeze({ rootId, relativePath }))
}

export function mappedPattern(rootId: string, relativePath: string, fileNamePattern: string): MappedEntry {
  return Object.freeze({ rootId, relativePath, fileNamePattern })
}
