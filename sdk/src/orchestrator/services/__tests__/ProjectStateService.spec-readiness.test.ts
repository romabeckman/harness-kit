import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProjectStateService } from '../ProjectStateService'

describe('ProjectStateService spec readiness', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('rejects an existing but empty domain directory', () => {
    const workingDir = mkdtempSync(join(tmpdir(), 'spec-readiness-'))
    dirs.push(workingDir)
    mkdirSync(join(workingDir, 'docs', 'specs', 'orders'), { recursive: true })

    expect(new ProjectStateService(workingDir).checkSpecFilesPresent('orders')).toBe(false)
  })

  it('rejects a domain with no tactical design tasks', () => {
    const workingDir = mkdtempSync(join(tmpdir(), 'spec-readiness-'))
    dirs.push(workingDir)
    const specsDir = join(workingDir, 'docs', 'specs', 'orders')
    mkdirSync(specsDir, { recursive: true })
    writeFileSync(join(specsDir, '003-orders-tactical-design.md'), '# Tactical Design')
    writeFileSync(join(specsDir, '004-orders-test-scenarios.md'), '# Test Scenarios')

    expect(new ProjectStateService(workingDir).checkSpecFilesPresent('orders')).toBe(false)
  })

  it('rejects partially generated tactical designs', () => {
    const workingDir = mkdtempSync(join(tmpdir(), 'spec-readiness-'))
    dirs.push(workingDir)
    const specsDir = join(workingDir, 'docs', 'specs', 'orders')
    mkdirSync(specsDir, { recursive: true })
    writeFileSync(join(specsDir, '003-api-tactical-design.md'), [
      '## Section 6 — Ordered Development Tasks',
      '```json',
      '[{"id":"01","title":"Implement order API","description":"Implement order API"}]',
      '```',
    ].join('\n'))
    writeFileSync(join(specsDir, '003-worker-tactical-design.md'), '# Tactical Design')
    writeFileSync(join(specsDir, '004-orders-test-scenarios.md'), '# Test Scenarios\n\n- imports valid orders')

    expect(new ProjectStateService(workingDir).checkSpecFilesPresent('orders')).toBe(false)
  })

  it('accepts a domain with tactical tasks and test scenarios', () => {
    const workingDir = mkdtempSync(join(tmpdir(), 'spec-readiness-'))
    dirs.push(workingDir)
    const specsDir = join(workingDir, 'docs', 'specs', 'orders')
    mkdirSync(specsDir, { recursive: true })
    writeFileSync(join(specsDir, '003-orders-tactical-design.md'), [
      '## Section 6 — Ordered Development Tasks',
      '',
      '```json',
      '[{"id":"01","title":"Implement order import","description":"Import orders"}]',
      '```',
    ].join('\n'))
    writeFileSync(join(specsDir, '004-orders-test-scenarios.md'), '# Test Scenarios\n\n- imports valid orders')

    expect(new ProjectStateService(workingDir).checkSpecFilesPresent('orders')).toBe(true)
  })
})
