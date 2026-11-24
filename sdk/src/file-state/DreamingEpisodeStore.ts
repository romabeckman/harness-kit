import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import type { Feature, Task } from './types'
import type { OrientationUse, TddOutput } from '../orchestrator/utils/PhaseFileUtils'

export interface LearningFinding {
  review_reason?: 'trigger_met' | 'guidance_contradicted'
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
      previousAttemptId: previous?.review === 'RETRY' ? previous.id : undefined,
    })
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
      if (!project || !projectFile(project.root, finding.path)) continue
      const clean: LearningFinding = {
        path: finding.path, locator: finding.locator.slice(0, 300), summary: finding.summary.slice(0, 1000),
        scenario_id: typeof finding.scenario_id === 'string' ? finding.scenario_id.slice(0, 100) : undefined,
      }
      if (finding.review_reason === 'trigger_met' || finding.review_reason === 'guidance_contradicted') {
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
