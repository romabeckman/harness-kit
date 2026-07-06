import { describe, it, expect, beforeEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { FileStateManager } from '../FileStateManager'
import type { Feature } from '../types'

function makeTempDir(): string {
  const dir = join(tmpdir(), `fsm-test-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeBacklogContent(features: Array<{ id: string; deps: string[]; status: string }>): string {
  const header = '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n'
  const rows = features.map(f =>
    `| **${f.id}** | **Title ${f.id}** | domain_${f.id.toLowerCase()} | backend | 1 | ${f.deps.join(',') || 'None'} | 0 | - | - | ${f.status} |`
  )
  return header + rows.join('\n') + '\n'
}

function makeFeatureObj(id: string, deps: string[], status: string): Feature {
  return {
    id,
    title: `Feature ${id}`,
    domain: `domain_${id.toLowerCase()}`,
    layer: 'backend',
    priority: 1,
    dependencies: deps,
    reworks: 0,
    scoreTL: null,
    scoreAdv: null,
    status: status as any,
  }
}

describe('FileStateManager.blockDependents', () => {
  let fsm: FileStateManager
  let productDir: string

  beforeEach(() => {
    productDir = makeTempDir()
    fsm = new FileStateManager({ productDir })
  })

  it('returns empty array when no feature depends on the blocked one', () => {
    const features = [
      makeFeatureObj('F001', [], 'BLOCKED'),
      makeFeatureObj('F002', [], 'NOT_STARTED'),
    ]
    writeFileSync(
      join(productDir, 'BACKLOG.md'),
      makeBacklogContent([
        { id: 'F001', deps: [], status: 'BLOCKED' },
        { id: 'F002', deps: [], status: 'NOT_STARTED' },
      ])
    )

    const result = fsm.blockDependents('F001', features)
    expect(result).toEqual([])
  })

  it('blocks direct dependent', () => {
    const features = [
      makeFeatureObj('F001', [], 'BLOCKED'),
      makeFeatureObj('F002', ['F001'], 'NOT_STARTED'),
    ]
    writeFileSync(
      join(productDir, 'BACKLOG.md'),
      makeBacklogContent([
        { id: 'F001', deps: [], status: 'BLOCKED' },
        { id: 'F002', deps: ['F001'], status: 'NOT_STARTED' },
      ])
    )

    const result = fsm.blockDependents('F001', features)
    expect(result).toContain('F002')

    const updated = fsm.loadBacklog()
    expect(updated.find(f => f.id === 'F002')?.status).toBe('BLOCKED')
  })

  it('blocks transitive dependents (F001→F002→F003)', () => {
    const features = [
      makeFeatureObj('F001', [], 'BLOCKED'),
      makeFeatureObj('F002', ['F001'], 'NOT_STARTED'),
      makeFeatureObj('F003', ['F002'], 'NOT_STARTED'),
    ]
    writeFileSync(
      join(productDir, 'BACKLOG.md'),
      makeBacklogContent([
        { id: 'F001', deps: [], status: 'BLOCKED' },
        { id: 'F002', deps: ['F001'], status: 'NOT_STARTED' },
        { id: 'F003', deps: ['F002'], status: 'NOT_STARTED' },
      ])
    )

    const result = fsm.blockDependents('F001', features)
    expect(result).toContain('F002')
    expect(result).toContain('F003')

    const updated = fsm.loadBacklog()
    expect(updated.find(f => f.id === 'F003')?.status).toBe('BLOCKED')
  })

  it('skips already COMPLETED features', () => {
    const features = [
      makeFeatureObj('F001', [], 'BLOCKED'),
      makeFeatureObj('F002', ['F001'], 'COMPLETED'),
    ]
    writeFileSync(
      join(productDir, 'BACKLOG.md'),
      makeBacklogContent([
        { id: 'F001', deps: [], status: 'BLOCKED' },
        { id: 'F002', deps: ['F001'], status: 'COMPLETED' },
      ])
    )

    const result = fsm.blockDependents('F001', features)
    expect(result).not.toContain('F002')

    const updated = fsm.loadBacklog()
    expect(updated.find(f => f.id === 'F002')?.status).toBe('COMPLETED')
  })

  it('skips already FAILED features', () => {
    const features = [
      makeFeatureObj('F001', [], 'BLOCKED'),
      makeFeatureObj('F002', ['F001'], 'FAILED'),
    ]
    writeFileSync(
      join(productDir, 'BACKLOG.md'),
      makeBacklogContent([
        { id: 'F001', deps: [], status: 'BLOCKED' },
        { id: 'F002', deps: ['F001'], status: 'FAILED' },
      ])
    )

    const result = fsm.blockDependents('F001', features)
    expect(result).not.toContain('F002')
  })

  it('skips already BLOCKED features', () => {
    const features = [
      makeFeatureObj('F001', [], 'BLOCKED'),
      makeFeatureObj('F002', ['F001'], 'BLOCKED'),
    ]
    writeFileSync(
      join(productDir, 'BACKLOG.md'),
      makeBacklogContent([
        { id: 'F001', deps: [], status: 'BLOCKED' },
        { id: 'F002', deps: ['F001'], status: 'BLOCKED' },
      ])
    )

    const result = fsm.blockDependents('F001', features)
    expect(result).not.toContain('F002')
  })

  it('handles multiple parents — blocks only when all-or-any blocked dep detected', () => {
    // F003 depends on F001 AND F002. F001 blocks. F002 is COMPLETED.
    // F003 should still be blocked because F001 is in the blocked set.
    const features = [
      makeFeatureObj('F001', [], 'BLOCKED'),
      makeFeatureObj('F002', [], 'COMPLETED'),
      makeFeatureObj('F003', ['F001', 'F002'], 'NOT_STARTED'),
    ]
    writeFileSync(
      join(productDir, 'BACKLOG.md'),
      makeBacklogContent([
        { id: 'F001', deps: [], status: 'BLOCKED' },
        { id: 'F002', deps: [], status: 'COMPLETED' },
        { id: 'F003', deps: ['F001', 'F002'], status: 'NOT_STARTED' },
      ])
    )

    const result = fsm.blockDependents('F001', features)
    expect(result).toContain('F003')
  })
})
