import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DreamingHandoffs } from '../DreamingHandoffs'
import type { IFileStateManager } from '../FileStateManager'
import { MemoryHandler } from '../../orchestrator/phases/MemoryHandler'
import type { Reviewontext } from '../../orchestrator/phases/AbstractPhaseHandler'
import { Complexity, Phase } from '../../orchestrator/types'

describe('DreamingHandoffs', () => {
  let root: string
  let queue: string
  let file: string
  let registry: DreamingHandoffs
  const owner = 'docs/feature/RECOVERY.md'
  const feature = 'feature:recovery'
  const source = { path: 'retry.test.ts', locator: 'retains identity' }
  const orientation = {
    id: 'persisted-retry', revision: 1, applies_when: 'Persisted retries',
    action: 'Check identity across instances', skip_when: 'Fresh capture', sources: [source],
  }
  const handoff = {
    operation: 'publish', feature_node_id: feature, destination: owner, hypothesis_id: orientation.id,
    revision: 1, expected_published_revision: null, orientation,
    evidence: { evaluation_id: 'paired-check', result: 'Verified gain', sources: [source] },
  }

  function writeFeature(items: unknown[]): void {
    const text = [
      '---', `node_id: "${feature}"`, '---', '', '```graph', JSON.stringify({ node_id: feature }), '```',
      '', '# Recovery', '', '## RED guidance', '', '```json', JSON.stringify(items), '```',
      '', '## REFERENCES',
    ].join('\n')
    writeFileSync(join(root, owner), text)
  }

  function status(): string {
    return JSON.parse(readFileSync(file, 'utf8')).status
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'dreaming-handoffs-'))
    queue = join(root, 'docs', 'product', 'project-dreaming', 'handoffs')
    file = join(queue, 'persisted-retry.json')
    mkdirSync(dirname(join(root, owner)), { recursive: true })
    mkdirSync(queue, { recursive: true })
    writeFileSync(join(root, 'docs', '.graph.json'), JSON.stringify({ nodes: [{ id: feature, path: owner }] }))
    writeFileSync(join(root, source.path), source.locator)
    writeFileSync(file, JSON.stringify({ status: 'ready', project: '.', handoff }))
    writeFeature([])
    registry = new DreamingHandoffs(queue, root, ['.'])
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('keeps a handoff pending until the exact canonical orientation is verified', () => {
    const [pending] = registry.pending()
    expect(pending.handoff.hypothesis_id).toBe(orientation.id)
    registry.confirm(pending)
    expect(status()).toBe('ready')
    writeFeature([orientation])
    expect(registry.pending()).toEqual([])
    expect(status()).toBe('applied')
    expect(registry.pending()).toEqual([])
  })

  it('keeps conflicting publication and withdrawal pending', () => {
    const withdrawal = join(queue, 'withdraw.json')
    writeFileSync(withdrawal, JSON.stringify({ status: 'ready', project: '.', handoff: {
      ...handoff, operation: 'withdraw', orientation: undefined, expected_published_revision: 1,
    } }))
    expect(registry.pending()).toEqual([])
    expect(status()).toBe('ready')
    expect(JSON.parse(readFileSync(withdrawal, 'utf8')).status).toBe('ready')
  })

  it('recognizes previously published guidance under the legacy heading', () => {
    writeFeature([orientation])
    const path = join(root, owner)
    writeFileSync(path, readFileSync(path, 'utf8').replace('## RED guidance', '## Orientações para o RED'))
    expect(registry.pending()).toEqual([])
    expect(status()).toBe('applied')
  })

  it('keeps a published revision conflict for retry and does not dispatch it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      writeFeature([{ ...orientation, revision: 2 }])
      expect(registry.pending()).toEqual([])
      expect(status()).toBe('ready')
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('confirms withdrawal after the routed document drops the same orientation', () => {
    writeFeature([orientation])
    writeFileSync(file, JSON.stringify({
      status: 'ready', project: '.', handoff: {
        ...handoff, operation: 'withdraw', orientation: undefined, expected_published_revision: 1,
      },
    }))
    const [entry] = registry.pending()
    registry.confirm(entry)
    expect(status()).toBe('ready')
    writeFeature([])
    registry.confirm(entry)
    expect(status()).toBe('applied')
  })

  it('dispatches handoffs through the Memory phase and confirms the canonical update', async () => {
    const invokeAgent = vi.fn<Reviewontext['invokeAgent']>().mockImplementation(async invocation => {
      expect(invocation.skill).toBe('harness-kit:project-memory')
      expect(invocation.prompt).toContain(JSON.stringify(handoff))
      writeFeature([orientation])
      return { success: true, raw: 'Publication confirmed' }
    })
    const context: Reviewontext = {
      workingDir: root,
      config: { scope: 'Recovery', complexity: Complexity.AUTO, score: 0.8, reworks: 1, projectPaths: [root] },
      fsm: {
        existRefinement: () => false, existScope: () => false,
        loadBootstrapConfig: () => ({}), loadRecentDecisions: () => [], appendDecision: vi.fn(),
      } as unknown as IFileStateManager,
      invokeAgent,
      getActiveFeature: () => null,
      checkSpecFilesPresent: () => false,
      extractTasksFromTacticalDesign: () => [],
    }

    expect(await new MemoryHandler().handle(Phase.MEMORY, context)).toBe(Phase.DEPLOY)
    expect(invokeAgent).toHaveBeenCalledOnce()
    expect(status()).toBe('applied')
  })
})
