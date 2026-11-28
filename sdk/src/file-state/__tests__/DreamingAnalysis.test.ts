import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildDreamingPrompt, validateDreamingReceipt } from '../DreamingAnalysis'

describe('Project Dreaming analysis receipts', () => {
  const root = mkdtempSync(join(tmpdir(), 'dreaming-receipt-'))
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('verifies every reported candidate and its originating attempt in the owning project', () => {
    const queue = join(root, 'docs/harness-history/learning/active')
    mkdirSync(queue, { recursive: true })
    writeFileSync(join(queue, 'recovery.md'), '---\nid: recovery\nfeature_node_id: "feature:recovery"\napplies_when: recovery changes\nproposed_action: test restart\nskip_when: equivalent test exists\nprediction: catches lost identity\nrefutation: baseline catches it\nreview_trigger: next recovery change\n---\n## Origin evidence\nep-retry')
    const receipt = {
      episode_id: 'ep-pass', project: root, feature: 'feature:recovery',
      inspected_episode_ids: ['ep-retry', 'ep-pass'], status: 'recorded', evidence_refs: ['test.ts#recovery'],
      hypotheses: [{ id: 'recovery', disposition: 'created', origin_episode_ids: ['ep-retry'] }],
    }
    expect(validateDreamingReceipt(JSON.stringify(receipt), root, 'ep-pass', ['ep-retry', 'ep-pass']).status).toBe('recorded')
    expect(validateDreamingReceipt(JSON.stringify({ ...receipt, hypotheses: [...receipt.hypotheses, { id: 'missing', disposition: 'created', origin_episode_ids: ['ep-pass'] }] }), root, 'ep-pass', ['ep-retry', 'ep-pass']).status).toBe('incomplete')
    expect(validateDreamingReceipt(JSON.stringify({ ...receipt, inspected_episode_ids: ['ep-pass'] }), root, 'ep-pass', ['ep-retry', 'ep-pass']).status).toBe('incomplete')
    expect(validateDreamingReceipt(JSON.stringify({ ...receipt, feature: 'feature:other' }), root, 'ep-pass', ['ep-retry', 'ep-pass']).status).toBe('incomplete')
    writeFileSync(join(queue, 'recovery.md'), 'feature:recovery\n## Origin evidence\nep-retry')
    expect(validateDreamingReceipt(JSON.stringify(receipt), root, 'ep-pass', ['ep-retry', 'ep-pass']).status).toBe('incomplete')
  })

  it('keeps an unexplained no_hypothesis pending', () => {
    expect(validateDreamingReceipt(JSON.stringify({ episode_id: 'ep', status: 'no_hypothesis' }), root, 'ep', ['ep']).status).toBe('incomplete')
  })

  it('accepts a nested relative project path and handles multiple hypotheses with appended origins', () => {
    const project = join(root, 'packages', 'sdk')
    const queue = join(project, 'docs/harness-history/learning/active')
    mkdirSync(queue, { recursive: true })
    const record = (id: string, origins: string[]) => `---\nid: ${id}\nfeature_node_id: "feature:recovery"\napplies_when: recovery changes\nproposed_action: test persisted recovery\nskip_when: equivalent coverage exists\nprediction: detects lost identity\nrefutation: baseline detects it\nreview_trigger: next recovery change\n---\n## Origin evidence\n${origins.join('\n')}`
    writeFileSync(join(queue, 'restart-identity.md'), record('restart-identity', ['ep-retry', 'ep-pass']))
    writeFileSync(join(queue, 'independent-boundary.md'), record('independent-boundary', ['ep-pass']))
    const receipt = {
      episode_id: 'ep-pass', project: 'packages/sdk', feature: 'feature:recovery',
      inspected_episode_ids: ['ep-retry', 'ep-pass'], status: 'recorded', evidence_refs: ['tests/recovery.test.ts#restart'],
      hypotheses: [
        { id: 'restart-identity', disposition: 'updated', origin_episode_ids: ['ep-retry', 'ep-pass'] },
        { id: 'independent-boundary', disposition: 'created', origin_episode_ids: ['ep-pass'] },
      ],
    }
    const first = validateDreamingReceipt(JSON.stringify(receipt), project, 'ep-pass', ['ep-retry', 'ep-pass'])
    expect(first.status).toBe('recorded')
    expect(first.hypotheses).toHaveLength(2)
    expect(validateDreamingReceipt(JSON.stringify(receipt), project, 'ep-pass', ['ep-retry', 'ep-pass'])).toEqual(first)
    expect(buildDreamingPrompt({ attempts: [{ sourceIssues: [{ path: 'retry.test.ts', reason: 'ambiguous project ownership' }] }] }, true))
      .toContain('If an issue blocks necessary inspection, return incomplete')
  })

  it('accepts a verified legacy hypothesis_id receipt', () => {
    const queue = join(root, 'docs/harness-history/learning/archived')
    mkdirSync(queue, { recursive: true })
    writeFileSync(join(queue, 'legacy-rule.md'), '## Origin evidence\nep-legacy')
    const result = validateDreamingReceipt(JSON.stringify({ episode_id: 'ep-legacy', status: 'recorded', hypothesis_id: 'legacy-rule' }), root, 'ep-legacy', ['ep-legacy'])
    expect(result).toMatchObject({ status: 'recorded', hypotheses: [{ id: 'legacy-rule', disposition: 'already_linked', origin_episode_ids: ['ep-legacy'] }] })
  })
})
