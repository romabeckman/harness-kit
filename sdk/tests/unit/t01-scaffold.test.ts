import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('T01 — SDK scaffold', () => {
  it('package.json has name harness-kit-sdk', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'))
    expect(pkg.name).toBe('harness-kit-sdk')
  })

  it('package.json has vitest as devDependency', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'))
    expect(pkg.devDependencies).toHaveProperty('vitest')
  })

  it('package.json has typescript as devDependency', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'))
    expect(pkg.devDependencies).toHaveProperty('typescript')
  })

  it('tsconfig.json enables strict mode', () => {
    const tsconfig = JSON.parse(readFileSync(resolve(__dirname, '../../tsconfig.json'), 'utf-8'))
    expect(tsconfig.compilerOptions.strict).toBe(true)
  })

  it('tsconfig.build.json excludes tests', () => {
    const tsconfig = JSON.parse(readFileSync(resolve(__dirname, '../../tsconfig.build.json'), 'utf-8'))
    expect(tsconfig.exclude).toContain('tests')
  })
})
