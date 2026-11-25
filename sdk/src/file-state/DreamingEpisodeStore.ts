import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import type { Feature, Task } from './types'
import type { OrientationUse, TddOutput } from '../orchestrator/utils/PhaseFileUtils'
import type { DreamingReceipt } from './DreamingAnalysis'

export interface LearningFinding {
  review_reason?: 'trigger_met' | 'guidance_contradicted' | 'new_evidence'
  path: string
  locator: string
  summary: string
  project?: string
  scenario_id?: string
}

export interface DreamingProject {
  root: string
  taskIds: string[]
  orientation_use?: OrientationUse[]
  findings?: LearningFinding[]
  sources?: string[]
  analysis?: { fingerprint: string; receipt: DreamingReceipt }
  processed?: true
}

export interface DreamingEpisode {
  id: string
  capturedAt: string
  featureId: string
  domain: string
  reworks: number
  handoffDigest: string
  metrics: TddOutput['metrics']
  sourceSessions: string[]
  projects: DreamingProject[]
  sourceIssues?: { path: string; reason: string }[]
  previousAttemptId?: string
  review?: 'PASS' | 'RETRY' | 'BLOCK' | 'FAIL' | 'SKIPPED' | 'INTERRUPTED'
  closed?: true
}

function handoffDigest(output: TddOutput): string {
  return createHash('sha256').update(JSON.stringify(output)).digest('hex')
}

export function projectFile(root: string, path: string): string | undefined {
  if (!path || isAbsolute(path)) return undefined
  try {
    const canonicalRoot = realpathSync(root)
    const target = realpathSync(resolve(canonicalRoot, path))
    const fromRoot = relative(canonicalRoot, target)
    if (!fromRoot || fromRoot === '..' || /^\.\.[/\\]/.test(fromRoot) || isAbsolute(fromRoot)) return undefined
    return statSync(target).isFile() ? target : undefined
  } catch {
    return undefined
  }
}

function ownerOf(projects: DreamingProject[], label: string | undefined, workingDir: string): DreamingProject | undefined {
  if (!label || label === '-') return projects.length === 1 ? projects[0] : undefined
  const matches = projects.filter(project => project.root === resolve(workingDir, label) || basename(project.root) === label)
  return matches.length === 1 ? matches[0] : undefined
}

export class DreamingEpisodeStore {
  private readonly directory: string

  constructor(private readonly workingDir: string, productDir: string) {
    this.directory = join(productDir, 'project-dreaming', 'episodes')
  }

  list(): DreamingEpisode[] {
    try {
      return readdirSync(this.directory).filter(name => /^[a-f\d-]{36}\.json$/.test(name)).flatMap(name => {
        try {
          const episode = JSON.parse(readFileSync(join(this.directory, name), 'utf8')) as DreamingEpisode
          if (name === `${episode.id}.json` && typeof episode.capturedAt === 'string'
              && Array.isArray(episode.projects) && Array.isArray(episode.sourceSessions)) return [episode]
        } catch {
          console.warn(`[project-dreaming] Unreadable episode: ${name}`)
        }
        return []
      }).sort((left, right) => left.capturedAt.localeCompare(right.capturedAt) || left.id.localeCompare(right.id))
    } catch {
      return []
    }
  }

  private save(episode: DreamingEpisode): void {
    const path = join(this.directory, `${episode.id}.json`)
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      mkdirSync(this.directory, { recursive: true })
      writeFileSync(temporary, JSON.stringify(episode, null, 2))
      renameSync(temporary, path)
    } catch (error) {
      rmSync(temporary, { force: true })
      throw error
    }
  }

  private find(feature: Feature, output?: TddOutput): DreamingEpisode | undefined {
    const digest = output && handoffDigest(output)
    return this.list().reverse().find(item => item.featureId === feature.id && item.domain === feature.domain
      && item.reworks === feature.reworks && !item.closed && (digest === undefined || item.handoffDigest === digest))
  }

  canResume(feature: Feature, output: TddOutput, tasks: Task[]): boolean {
    const episode = this.find(feature, output)
    return !!episode && !episode.review && tasks.every(task => task.status === 'IN_PROGRESS'
      && ownerOf(episode.projects, task.project, this.workingDir)?.taskIds.includes(task.taskId))
  }

  recordDevelopment(feature: Feature, output: TddOutput, tasks: Task[], roots: string[], sessionId?: string): void {
    const projects: DreamingProject[] = [...new Set((roots.length ? roots : ['.']).map(root => resolve(this.workingDir, root)))]
      .map(root => ({ root, taskIds: [] }))
    for (const task of tasks) {
      ownerOf(projects, task.project, this.workingDir)?.taskIds.push(task.taskId)
    }
    const sourceIssues: NonNullable<DreamingEpisode['sourceIssues']> = []
    for (const path of output.modifiedFiles) {
      const matches = projects.flatMap(project => {
        const prefix = basename(project.root) + '/'
        const local = path.replaceAll('\\', '/').startsWith(prefix) ? path.replaceAll('\\', '/').slice(prefix.length) : path
        return projectFile(project.root, local) ? [{ project, local }] : []
      })
      if (matches.length === 1) (matches[0].project.sources ??= []).push(matches[0].local)
      else sourceIssues.push({ path, reason: matches.length ? 'ambiguous project ownership' : 'file not found in project roots' })
    }
    for (const raw of Array.isArray(output.learning_evidence) ? output.learning_evidence : []) {
      if (!raw || typeof raw.path !== 'string' || typeof raw.locator !== 'string' || !raw.locator.trim() || typeof raw.summary !== 'string' || !raw.summary.trim()) continue
      const owner = ownerOf(projects, typeof raw.project === 'string' ? raw.project : undefined, this.workingDir)
      if (!owner || !projectFile(owner.root, raw.path)) {
        sourceIssues.push({ path: raw.path, reason: owner ? 'file not found in owning project' : 'ambiguous project ownership' })
        continue
      }
      ;(owner.findings ??= []).push({ path: raw.path, locator: raw.locator.slice(0, 300), summary: raw.summary.slice(0, 1000), scenario_id: typeof raw.scenario_id === 'string' ? raw.scenario_id.slice(0, 100) : undefined })
    }
    for (const entry of output.orientation_use ?? []) {
      const owner = ownerOf(projects, entry.project, this.workingDir)
      if (owner) (owner.orientation_use ??= []).push(entry)
    }
    if (output.orientation_use?.length === 0) {
      for (const project of projects) if (project.taskIds.length) project.orientation_use = []
    }
    const previous = this.find({ ...feature, reworks: feature.reworks - 1 })
    this.save({
      id: randomUUID(), capturedAt: new Date().toISOString(), featureId: feature.id, domain: feature.domain,
      reworks: feature.reworks, handoffDigest: handoffDigest(output), metrics: output.metrics,
      sourceSessions: sessionId ? [sessionId] : [],
      projects: projects.filter(project => project.taskIds.length > 0),
      ...(sourceIssues.length ? { sourceIssues } : {}),
      previousAttemptId: previous?.review === 'RETRY' ? previous.id : undefined,
    })
  }

  learningChain(terminal: DreamingEpisode, root: string): { attempts: DreamingEpisode[]; error?: string } {
    const byId = new Map(this.list().map(episode => [episode.id, episode]))
    const seen = new Set<string>()
    const attempts: DreamingEpisode[] = []
    let current: DreamingEpisode | undefined = terminal
    while (current) {
      if (seen.has(current.id)) return { attempts, error: `Cycle in episode chain at ${current.id}.` }
      seen.add(current.id)
      if (current.featureId !== terminal.featureId || current.domain !== terminal.domain) return { attempts, error: `Episode ${current.id} belongs to a different feature.` }
      const owner = current.projects.find(project => project.root === root)
      if (owner) attempts.unshift({ ...current, projects: [owner] })
      if (!current.previousAttemptId) break
      const previous = byId.get(current.previousAttemptId)
      if (!previous) return { attempts, error: `Missing previous episode ${current.previousAttemptId}.` }
      current = previous
    }
    return { attempts }
  }

  recordAnalysis(episodeId: string, root: string, fingerprint: string, receipt: DreamingReceipt): void {
    const episode = this.list().find(item => item.id === episodeId)
    const project = episode?.projects.find(item => item.root === root)
    if (episode && project) {
      project.analysis = { fingerprint, receipt }
      if (receipt.status !== 'incomplete') project.processed = true
      else delete project.processed
      this.save(episode)
    }
  }

  recordReview(
    feature: Feature, output: TddOutput, verdict: NonNullable<DreamingEpisode['review']>,
    sessions: string[] = [], evidence: readonly unknown[] = [],
  ): DreamingEpisode | undefined {
    const episode = this.find(feature, output)
    if (!episode) return
    episode.review = verdict
    episode.sourceSessions = [...new Set([...episode.sourceSessions, ...sessions])]
    for (const raw of evidence) {
      if (!raw || typeof raw !== 'object') continue
      const finding = raw as Partial<LearningFinding>
      if (typeof finding.path !== 'string' || typeof finding.locator !== 'string' || !finding.locator.trim()
        || typeof finding.summary !== 'string' || !finding.summary.trim()) continue
      const project = ownerOf(episode.projects, typeof finding.project === 'string' ? finding.project : undefined, this.workingDir)
      if (!project || !projectFile(project.root, finding.path)) {
        const issue = { path: finding.path, reason: project ? 'file not found in owning project' : 'ambiguous project ownership' }
        const issues = episode.sourceIssues ??= []
        if (!issues.some(item => item.path === issue.path && item.reason === issue.reason)) issues.push(issue)
        continue
      }
      const clean: LearningFinding = {
        path: finding.path, locator: finding.locator.slice(0, 300), summary: finding.summary.slice(0, 1000),
        scenario_id: typeof finding.scenario_id === 'string' ? finding.scenario_id.slice(0, 100) : undefined,
      }
      if (finding.review_reason === 'trigger_met' || finding.review_reason === 'guidance_contradicted' || finding.review_reason === 'new_evidence') {
        clean.review_reason = finding.review_reason
      }
      const findings = project.findings ??= []
      const existing = findings.find(item => item.path === clean.path && item.locator === clean.locator && item.summary === clean.summary)
      if (!existing) findings.push(clean)
      else if (clean.review_reason) existing.review_reason = clean.review_reason
    }
    this.save(episode)
    return episode
  }

  closeFeature(feature: Feature): void {
    const terminal = this.find(feature)
    if (!terminal?.review || terminal.review === 'RETRY') return
    const byId = new Map(this.list().map(item => [item.id, item]))
    const chain: DreamingEpisode[] = []
    let episode: DreamingEpisode | undefined = terminal
    while (episode && !episode.closed) {
      chain.unshift(episode)
      byId.delete(episode.id)
      episode = episode.previousAttemptId ? byId.get(episode.previousAttemptId) : undefined
    }
    for (const attempt of chain) this.save({ ...attempt, closed: true })
  }

  markProcessed(episodeId: string, root: string): void {
    const episode = this.list().find(item => item.id === episodeId)
    const project = episode?.projects.find(item => item.root === root)
    if (episode && project) {
      project.processed = true
      this.save(episode)
    }
  }
}
