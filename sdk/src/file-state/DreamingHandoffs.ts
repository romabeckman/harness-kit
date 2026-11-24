import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve, relative, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { projectFile } from './DreamingEpisodeStore'

interface Handoff {
  operation: 'publish' | 'withdraw'
  feature_node_id: string
  destination: string
  hypothesis_id: string
  revision: number
  expected_published_revision: number | null
  orientation?: Record<string, unknown>
  evidence: { result: string; evaluation_id?: string; sources: unknown[] }
}

interface PendingHandoff {
  file: string
  original: string
  project: string
  handoff: Handoff
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isHandoff(value: unknown): value is Handoff {
  if (!isObject(value) || !hasText(value.feature_node_id) || !/^feature:\S+$/.test(value.feature_node_id)
    || !hasText(value.destination) || !/^docs\/feature\/(?:[\w.-]+\/)*[\w.-]+\.md$/.test(value.destination)
    || value.destination.split('/').includes('..')
    || !hasText(value.hypothesis_id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.hypothesis_id)
    || !positiveInteger(value.revision) || !isObject(value.evidence) || !hasText(value.evidence.result)
    || !Array.isArray(value.evidence.sources) || value.evidence.sources.length === 0) return false
  if (value.operation === 'withdraw') return value.revision === value.expected_published_revision && value.orientation === undefined
  const orientation = value.orientation
  return value.operation === 'publish' && hasText(value.evidence.evaluation_id)
    && (value.expected_published_revision === null
      || (positiveInteger(value.expected_published_revision) && value.revision > value.expected_published_revision))
    && isObject(orientation) && orientation.id === value.hypothesis_id && orientation.revision === value.revision
    && hasText(orientation.applies_when) && hasText(orientation.action) && hasText(orientation.skip_when)
    && Array.isArray(orientation.sources) && orientation.sources.length > 0
}

function sourceMatches(project: string, source: unknown): boolean {
  if (!isObject(source) || !hasText(source.path) || !hasText(source.locator)) return false
  const realSource = projectFile(project, source.path)
  if (!realSource) return false
  const history = resolve(project, 'docs/harness-history')
  if (isWithin(history, resolve(project, source.path))) return false
  try {
    if (isWithin(realpathSync(history), realSource)) return false
  } catch {
    // No canonical history directory exists.
  }
  return readFileSync(realSource, 'utf8').includes(source.locator)
}

function isWithin(directory: string, path: string): boolean {
  const location = relative(directory, path)
  return location !== '..' && !location.startsWith(`..${sep}`) && !isAbsolute(location)
}

function readOrientations(content: string): Record<string, unknown>[] {
  let fence = ''
  let active = false
  let seen = false
  const body: string[] = []
  for (const line of content.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (!fence && /^ {0,3}#{1,2}[ \t]/.test(line)) {
      active = line.trim().replace(/[ \t]+#+$/, '') === '## Orientações para o RED'
      if (active && seen) throw new Error('Duplicate RED orientation sections.')
      seen ||= active
      continue
    }
    if (active) body.push(line)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = ''
    }
  }
  if (!body.join('').trim()) return []
  const payload = /^```json\s*\n([\s\S]*?)\n```$/.exec(body.join('\n').trim())
  const entries: unknown = payload && JSON.parse(payload[1])
  if (!Array.isArray(entries) || !entries.every(isObject)) throw new Error('Invalid RED orientation section.')
  return entries
}

function canonicalOrientation(project: string, handoff: Handoff): Record<string, unknown> | undefined {
  const index = projectFile(project, 'docs/.graph.json')
  const target = projectFile(project, handoff.destination)
  if (!target || !index) throw new Error('Feature document or index unavailable.')
  if (!isWithin(join(realpathSync(project), 'docs', 'feature'), target)) throw new Error('Feature document is outside canonical feature memory.')
  const nodes: unknown = JSON.parse(readFileSync(index, 'utf8')).nodes
  const matches = Array.isArray(nodes) ? nodes.filter(node => node?.id === handoff.feature_node_id) : []
  if (matches.length !== 1 || matches[0].path !== handoff.destination) throw new Error('Feature ownership is not confirmed by the index.')
  const document = readFileSync(target, 'utf8')
  const block = /^---\r?\n[\s\S]*?\r?\n---\s*\r?\n\s*```graph\r?\n([\s\S]*?)\r?\n```/.exec(document)
  if (!block || JSON.parse(block[1]).node_id !== handoff.feature_node_id) throw new Error('Feature micrograph does not match the handoff.')
  const matchesById = readOrientations(document.slice(block[0].length)).filter(item => item.id === handoff.hypothesis_id)
  if (matchesById.length > 1) throw new Error('Duplicate canonical orientation ID.')
  return matchesById[0]
}

function alreadyApplied(entry: PendingHandoff, current: Record<string, unknown> | undefined): boolean {
  return entry.handoff.operation === 'withdraw' ? current === undefined : isDeepStrictEqual(current, entry.handoff.orientation)
}

export class DreamingHandoffs {
  constructor(private readonly directory: string, private readonly workingDir: string, private readonly roots: string[]) {}

  pending(): PendingHandoff[] {
    let names: string[]
    try {
      names = readdirSync(this.directory).sort()
    } catch {
      return []
    }
    const roots = new Set((this.roots.length ? this.roots : ['.']).map(root => resolve(this.workingDir, root)))
    return names.filter(name => name.endsWith('.json')).flatMap(name => {
      try {
        const file = join(this.directory, name)
        const original = readFileSync(file, 'utf8')
        const envelope = JSON.parse(original)
        if (envelope.status === 'applied') return []
        if (envelope.status !== 'ready' || !hasText(envelope.project) || !isHandoff(envelope.handoff)) throw new Error('Invalid handoff.')
        const project = resolve(this.workingDir, envelope.project)
        const handoff: Handoff = envelope.handoff
        if (!roots.has(project)) throw new Error('Unknown owning project.')
        const sources = [...handoff.evidence.sources, ...((handoff.orientation?.sources as unknown[]) ?? [])]
        if (!sources.every(source => sourceMatches(project, source))) throw new Error('Unresolved handoff evidence.')
        const entry = { file, original, project, handoff }
        const current = canonicalOrientation(project, handoff)
        if (alreadyApplied(entry, current)) {
          this.confirm(entry)
          return []
        }
        if ((current?.revision ?? null) !== handoff.expected_published_revision) throw new Error('Published revision conflict.')
        return [entry]
      } catch (error) {
        console.warn(`[project-dreaming] Pending handoff ${name}:`, error)
        return []
      }
    })
  }

  confirm(entry: PendingHandoff): void {
    const { file, original, project, handoff } = entry
    const temporary = `${file}.${randomUUID()}.tmp`
    try {
      if (!alreadyApplied(entry, canonicalOrientation(project, handoff)) || readFileSync(file, 'utf8') !== original) return
      writeFileSync(temporary, JSON.stringify({ ...JSON.parse(original), status: 'applied' }, null, 2))
      renameSync(temporary, file)
    } catch (error) {
      console.warn(`[project-dreaming] Handoff ${handoff.hypothesis_id} remains pending:`, error)
    } finally {
      rmSync(temporary, { force: true })
    }
  }
}
