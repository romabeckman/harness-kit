import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { createHash } from 'node:crypto'
import { JsonExtractionProtocol } from '../json-extraction/JsonExtractionProtocol'
import { isExtractionResult } from '../json-extraction/types'
import { projectFile } from './DreamingEpisodeStore'
import type { DreamingEpisode } from './DreamingEpisodeStore'

export interface DreamingReceipt {
  episode_id: string
  project: string
  feature: string
  inspected_episode_ids: string[]
  status: 'recorded' | 'no_hypothesis' | 'incomplete'
  evidence_refs: string[]
  hypotheses?: { id: string; disposition: 'created' | 'updated' | 'already_linked'; origin_episode_ids: string[] }[]
  reason?: string
  step?: string
  required_input?: string
}

const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text)

export function dreamingFingerprint(attempts: DreamingEpisode[]): string {
  const inputs = attempts.map(attempt => ({ ...attempt, closed: undefined, projects: attempt.projects.map(({ analysis: _analysis, processed: _processed, ...project }) => {
    const paths = [...new Set([...(project.sources ?? []), ...(project.findings ?? []).map(item => item.path)])].sort()
    const sources = paths.map(path => {
      const file = projectFile(project.root, path)
      try { return [path, file ? createHash('sha256').update(readFileSync(file)).digest('hex') : 'missing'] }
      catch { return [path, 'unreadable'] }
    })
    return { ...project, sourcesFingerprint: sources }
  }) }))
  return createHash('sha256').update(JSON.stringify(inputs)).digest('hex')
}

export function buildDreamingPrompt(payload: Record<string, unknown>, collectionOnly: boolean): string {
  return [
    'Explicitly invoke harness-kit:project-dreaming. Read and apply its contract for this project and feature.',
    'Inspect only the supplied task sources and related attempts in chronological order. Attribute each observation to its project and attempt; do not invent evidence. Classified findings are optional.',
    'Find zero, one, or several distinct falsifiable choices of test selection, ordering, or reuse. One verifiable episode is sufficient, even without observed impact or a future ticket. Reconcile equivalent decisions and origins under existing IDs.',
    'Use only the owning project for learning records. Inspect cited test contents and distinguish observed facts from predictions. Read metadata.md, steps.md, verdict.md and score.md from supplied trace paths when present.',
    collectionOnly ? 'Only collect and reconcile hypotheses; do not evaluate, publish, or withdraw.' : 'Stage validated handoffs for the separate project-memory phase.',
    'Return JSON: episode_id, project, feature, inspected_episode_ids, status, evidence_refs. For recorded include hypotheses with id, disposition (created, updated, already_linked), and origin_episode_ids. For no_hypothesis include a specific reason and inspected evidence_refs. For incomplete include reason, step, and required_input.',
    JSON.stringify(payload),
  ].join('\n')
}

export function validateDreamingReceipt(raw: string, root: string, episodeId: string, allowedIds: string[]): DreamingReceipt {
  const incomplete = (reason: string): DreamingReceipt => ({ episode_id: episodeId, project: root, feature: '', inspected_episode_ids: [], status: 'incomplete', evidence_refs: [], reason, step: 'verify receipt', required_input: 'A valid receipt and verifiable project records.' })
  const extracted = JsonExtractionProtocol.extract(raw)
  if (!isExtractionResult(extracted)) return incomplete('Project Dreaming returned an invalid or empty receipt.')
  const value = extracted.data as Record<string, unknown>
  if (value.episode_id !== episodeId) return incomplete('The receipt identifies a different episode.')
  if (value.status === 'incomplete') {
    const result = incomplete(text(value.reason) ? value.reason : 'The runner reported incomplete without a reason.')
    if (text(value.step)) result.step = value.step
    if (text(value.required_input)) result.required_input = value.required_input
    return result
  }
  const legacy = value.status === 'recorded' && text(value.hypothesis_id) && value.hypotheses === undefined
  const inspected = legacy ? [episodeId] : value.inspected_episode_ids
  if (!strings(inspected) || inspected.length === 0 || inspected.some(id => !allowedIds.includes(id)) || !inspected.includes(episodeId) || (!legacy && (inspected.length !== allowedIds.length || inspected.some((id, index) => id !== allowedIds[index])))) return incomplete('The receipt has invalid inspected episodes.')
  if (!legacy && (!text(value.project) || (value.project !== root && value.project !== basename(root)) || !text(value.feature))) return incomplete('The receipt has an invalid project or feature.')
  if (value.status === 'no_hypothesis') {
    if (!text(value.reason) || !strings(value.evidence_refs) || value.evidence_refs.length === 0) return incomplete('A no_hypothesis receipt requires a reason and inspected sources.')
    return value as unknown as DreamingReceipt
  }
  if (value.status !== 'recorded') return incomplete('The receipt has an invalid status.')
  const entries: unknown[] = legacy ? [{ id: value.hypothesis_id, disposition: 'already_linked', origin_episode_ids: [episodeId] }] : Array.isArray(value.hypotheses) ? value.hypotheses : []
  if (!entries.length || (!legacy && (!strings(value.evidence_refs) || value.evidence_refs.length === 0))) return incomplete('A recorded receipt requires hypotheses and evidence.')
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') return incomplete('Invalid hypothesis entry.')
    const item = entry as Record<string, unknown>
    if (!text(item.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || !['created', 'updated', 'already_linked'].includes(String(item.disposition)) || !strings(item.origin_episode_ids) || !item.origin_episode_ids.length || item.origin_episode_ids.some(id => !inspected.includes(id))) return incomplete('Invalid hypothesis ID, disposition, or origin.')
    const path = ['active', 'archived'].map(queue => projectFile(root, `docs/harness-history/learning/${queue}/${item.id}.md`)).find(Boolean)
    if (!path) return incomplete(`The reported hypothesis ${item.id} was not found in the owning project.`)
    try {
      const content = readFileSync(path, 'utf8')
      const origins = content.split(/^## Origin evidence\s*$/m)[1]?.split(/^## /m)[0] ?? ''
      const header = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? ''
      const field = (name: string): string => (header.match(new RegExp(`^${name}:\\s*(.*?)\\s*$`, 'm'))?.[1] ?? '').replace(/^['"]|['"]$/g, '').trim()
      const required = ['applies_when', 'proposed_action', 'skip_when', 'prediction', 'refutation', 'review_trigger']
      if (!item.origin_episode_ids.every(id => origins.includes(id)) || (!legacy && (field('id') !== item.id || field('feature_node_id') !== value.feature || required.some(name => !field(name))))) return incomplete(`The reported hypothesis ${item.id} does not link the feature, origins, or required decision fields.`)
    } catch { return incomplete(`The reported hypothesis ${item.id} could not be read.`) }
  }
  return { ...value, project: legacy ? root : value.project, feature: legacy ? '' : value.feature, inspected_episode_ids: inspected, evidence_refs: legacy ? [] : value.evidence_refs, hypotheses: entries } as DreamingReceipt
}
