import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs'
import { join } from 'path'
import { BacklogParser } from './parsers/BacklogParser'
import { DevStateParser } from './parsers/DevStateParser'
import { BootstrapConfigParser } from './parsers/BootstrapConfigParser'
import type { Feature, Task, BootstrapConfig, FeatureStatus, TaskStatus, CurrentPhase, DecisionEntry } from './types'
import { createDefaultSteeringRules } from './types'
import { OrchestratorConfig, Phase, Complexity } from '../orchestrator/types'

export interface IFileStateManager {
  // ─── Scope ───────────────────────────────────────────────────────────────
  saveScope(scope: string): void
  loadScope(): string
  existScope(): boolean

  // ─── Refinement ──────────────────────────────────────────────────────────
  saveRefinement(content: string): void
  loadRefinement(): string
  existRefinement(): boolean

  // ─── Bootstrap ──────────────────────────────────────────────────────────
  ensureProductFiles(config?: OrchestratorConfig): void
  loadBootstrapConfig(): BootstrapConfig
  saveBootstrapConfig(config: BootstrapConfig): void
  existBootstrapConfig(): boolean

  // ─── Backlog ────────────────────────────────────────────────────────────
  loadBacklog(): Feature[]
  updateFeatureStatus(featureId: string, status: FeatureStatus, scores?: { tl: number; adv: number }): void
  incrementReworks(featureId: string): void
  resetReworks(featureId: string): void
  blockDependents(blockedId: string, features: Feature[]): string[]
  getExecutableFeatures(): Feature[]

  // ─── Development State ──────────────────────────────────────────────────
  loadDevelopmentState(): Task[]
  appendTasks(tasks: Task[]): void
  updateTaskStatus(featureId: string, taskId: string, phase: CurrentPhase, status: TaskStatus): void
  updateAllFeatureTasks(featureId: string, phase: CurrentPhase, status: TaskStatus): void
  resetTasksForRetry(featureId: string): void
  getPendingTasks(featureId: string): Task[]

  // ─── Decisions log ──────────────────────────────────────────────────────
  appendDecision(entry: DecisionEntry): void
  loadRecentDecisions(n: number): string[]

  // ─── Rework log ─────────────────────────────────────────────────────────
  writeReworkLog(domain: string, content: string): void

  // ─── Queries ────────────────────────────────────────────────────────────
  getNextTask(featureId: string): Task | null
}

export interface FileStateManagerOptions {
  productDir: string
  workingDir?: string
}

function atomicWrite(filePath: string, content: string): void {
  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, content, 'utf-8')
  try {
    renameSync(tmpPath, filePath)
  } catch (err: any) {
    if (err?.code === 'EPERM' || err?.code === 'EBUSY') {
      const { copyFileSync, unlinkSync } = require('fs')
      copyFileSync(tmpPath, filePath)
      try { unlinkSync(tmpPath) } catch {}
    } else {
      throw err
    }
  }
}

export class FileStateManager implements IFileStateManager {
  private readonly productDir: string
  private readonly workingDir: string

  constructor(options: FileStateManagerOptions) {
    this.productDir = options.productDir
    this.workingDir = options.workingDir ?? process.cwd()
  }

  // ─── Scope ───────────────────────────────────────────────────────────────

  saveScope(scope: string): void {
    mkdirSync(this.productDir, { recursive: true })
    const path = join(this.productDir, 'SCOPE.md')
    atomicWrite(path, scope)
  }

  loadScope(): string {
    const path = join(this.productDir, 'SCOPE.md')
    if (!existsSync(path)) return ''
    return readFileSync(path, 'utf-8').trim()
  }

  existScope(): boolean {
    return existsSync(join(this.productDir, 'SCOPE.md'))
  }

  // ─── Refinement ──────────────────────────────────────────────────────────

  saveRefinement(content: string): void {
    mkdirSync(this.productDir, { recursive: true })
    const path = join(this.productDir, 'REFINEMENT.md')
    atomicWrite(path, content)
  }

  loadRefinement(): string {
    const path = join(this.productDir, 'REFINEMENT.md')
    if (!existsSync(path)) return ''
    return readFileSync(path, 'utf-8').trim()
  }

  existRefinement(): boolean {
    return existsSync(join(this.productDir, 'REFINEMENT.md'))
  }

  // ─── Bootstrap ────────────────────────────────────────────────────────────

  ensureProductFiles(config?: OrchestratorConfig): void {
    mkdirSync(this.productDir, { recursive: true })
    if (config?.scope) {
      this.saveScope(config.scope)
    }
    const files = ['BACKLOG.md', 'DEVELOPMENT-STATE.md', 'DECISIONS.md', 'BOOTSTRAP-CONFIG.json']
    for (const file of files) {
      const dest = join(this.productDir, file)
      if (!existsSync(dest)) {
        writeFileSync(dest, this.defaultContent(file, config), 'utf-8')
      }
    }
  }

  private defaultContent(file: string, config?: OrchestratorConfig): string {
    switch (file) {
      case 'BACKLOG.md':
        return '| ID | Title | Domain | Agent | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'
      case 'DEVELOPMENT-STATE.md':
        return '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |\n| --- | --- | --- | --- | --- | --- | --- |\n'
      case 'DECISIONS.md':
        return '# Autonomous Decision Audit Trail\n\n| Timestamp | Feature | Decision | Scores | Rationale |\n| --- | --- | --- | --- | --- |\n'
      case 'BOOTSTRAP-CONFIG.json':
        return JSON.stringify({
          projectPaths: config?.projectPaths ?? [],
          currentPhase: Phase.BOOTSTRAP,
          scoreThresholdTL: config?.score ?? 0.70,
          scoreThresholdAdv: config?.score ?? 0.70,
          completionCriteria: { maxReworks: config?.reworks ?? 2 },
          cycleCounter: { completedCycles: 0 },
          steeringRules: createDefaultSteeringRules(config?.initialRules)
        }, null, 2)
      default:
        return ''
    }
  }

  existBootstrapConfig(): boolean {
    return existsSync(join(this.productDir, 'BOOTSTRAP-CONFIG.json'))
  }

  loadBootstrapConfig(): BootstrapConfig {
    const content = readFileSync(join(this.productDir, 'BOOTSTRAP-CONFIG.json'), 'utf-8')
    return BootstrapConfigParser.parse(content)
  }

  saveBootstrapConfig(config: BootstrapConfig): void {
    const path = join(this.productDir, 'BOOTSTRAP-CONFIG.json')
    atomicWrite(path, JSON.stringify(config, null, 2))
  }

  // ─── Backlog ──────────────────────────────────────────────────────────────

  loadBacklog(): Feature[] {
    const content = readFileSync(join(this.productDir, 'BACKLOG.md'), 'utf-8')
    return BacklogParser.parse(content)
  }

  updateFeatureStatus(featureId: string, status: FeatureStatus, scores?: { tl: number; adv: number }): void {
    const path = join(this.productDir, 'BACKLOG.md')
    const content = readFileSync(path, 'utf-8')
    const lines = content.split('\n')
    let found = false
    const updated = lines.map(line => {
      if (!line.startsWith('|')) return line
      const cells = line.split('|').slice(1, -1)
      if (cells.length < 10) return line
      const rowId = cells[0].trim().replace(/\*\*/g, '').replace(/`/g, '')
      if (rowId !== featureId) return line
      found = true
      // Update: Status (col 9), Score (TL) (col 7), Score (Adv) (col 8)
      const newCells = [...cells]
      newCells[9] = ` ${status} `
      if (scores) {
        newCells[7] = ` ${scores.tl} `
        newCells[8] = ` ${scores.adv} `
      }
      return '|' + newCells.join('|') + '|'
    })
    if (!found) throw new Error(`Feature not found: ${featureId}`)
    atomicWrite(path, updated.join('\n'))
  }

  incrementReworks(featureId: string): void {
    const path = join(this.productDir, 'BACKLOG.md')
    const content = readFileSync(path, 'utf-8')
    const lines = content.split('\n')
    let found = false
    const updated = lines.map(line => {
      if (!line.startsWith('|')) return line
      const cells = line.split('|').slice(1, -1)
      if (cells.length < 10) return line
      const rowId = cells[0].trim().replace(/\*\*/g, '').replace(/`/g, '')
      if (rowId !== featureId) return line
      found = true
      const newCells = [...cells]
      const current = parseInt(newCells[6].trim(), 10) || 0
      newCells[6] = ` ${current + 1} `
      return '|' + newCells.join('|') + '|'
    })
    if (!found) throw new Error(`Feature not found: ${featureId}`)
    atomicWrite(path, updated.join('\n'))
  }

  resetReworks(featureId: string): void {
    const path = join(this.productDir, 'BACKLOG.md')
    const content = readFileSync(path, 'utf-8')
    const lines = content.split('\n')
    let found = false
    const updated = lines.map(line => {
      if (!line.startsWith('|')) return line
      const cells = line.split('|').slice(1, -1)
      if (cells.length < 10) return line
      const rowId = cells[0].trim().replace(/\*\*/g, '').replace(/`/g, '')
      if (rowId !== featureId) return line
      found = true
      const newCells = [...cells]
      newCells[6] = ' 0 '
      return '|' + newCells.join('|') + '|'
    })
    if (!found) throw new Error(`Feature not found: ${featureId}`)
    atomicWrite(path, updated.join('\n'))
  }

  // ─── Development State ────────────────────────────────────────────────────

  loadDevelopmentState(): Task[] {
    const content = readFileSync(join(this.productDir, 'DEVELOPMENT-STATE.md'), 'utf-8')
    return DevStateParser.parse(content)
  }

  appendTasks(tasks: Task[]): void {
    const path = join(this.productDir, 'DEVELOPMENT-STATE.md')
    const content = existsSync(path) ? readFileSync(path, 'utf-8') : ''
    const newRows = tasks.map(t =>
      `| ${t.featureId} | ${t.taskId} | ${t.project} | ${t.description} | ${t.domain} | ${t.currentPhase} | ${t.status} |`
    )
    const trimmed = content.trimEnd()
    atomicWrite(path, trimmed + '\n' + newRows.join('\n') + '\n')
  }

  updateTaskStatus(featureId: string, taskId: string, phase: CurrentPhase, status: TaskStatus): void {
    const path = join(this.productDir, 'DEVELOPMENT-STATE.md')
    const content = readFileSync(path, 'utf-8')
    const lines = content.split('\n')
    const updated = lines.map(line => {
      if (!line.startsWith('|')) return line
      const cells = line.split('|').slice(1, -1)
      if (cells.length < 7) return line
      const rowFeatureId = cells[0].trim().replace(/\*\*/g, '').replace(/`/g, '')
      const rowTaskId = cells[1].trim().replace(/\*\*/g, '').replace(/`/g, '')
      if (rowFeatureId !== featureId || rowTaskId !== taskId) return line
      const newCells = [...cells]
      newCells[5] = ` ${phase} `
      newCells[6] = ` ${status} `
      return '|' + newCells.join('|') + '|'
    })
    atomicWrite(path, updated.join('\n'))
  }

  updateAllFeatureTasks(featureId: string, phase: CurrentPhase, status: TaskStatus): void {
    const path = join(this.productDir, 'DEVELOPMENT-STATE.md')
    if (!existsSync(path)) return
    const content = readFileSync(path, 'utf-8')
    const lines = content.split('\n')
    const updated = lines.map(line => {
      if (!line.startsWith('|')) return line
      const cells = line.split('|').slice(1, -1)
      if (cells.length < 7) return line
      const rowFeatureId = cells[0].trim().replace(/\*\*/g, '').replace(/`/g, '')
      if (rowFeatureId !== featureId) return line
      const newCells = [...cells]
      newCells[5] = ` ${phase} `
      newCells[6] = ` ${status} `
      return '|' + newCells.join('|') + '|'
    })
    atomicWrite(path, updated.join('\n'))
  }

  resetTasksForRetry(featureId: string): void {
    this.updateAllFeatureTasks(featureId, 'IMPLEMENTATION', 'NOT_STARTED')
  }

  getPendingTasks(featureId: string): Task[] {
    return this.loadDevelopmentState()
      .filter(t => t.featureId === featureId)
      .filter(t => t.status === 'IN_PROGRESS' || t.status === 'NOT_STARTED')
  }

  blockDependents(blockedId: string, features: Feature[]): string[] {
    const newlyBlocked: string[] = []
    const blockedSet = new Set<string>([blockedId])

    // BFS over the feature list to find all transitive dependents
    let changed = true
    while (changed) {
      changed = false
      for (const f of features) {
        if (blockedSet.has(f.id)) continue
        if (f.status === 'COMPLETED' || f.status === 'FAILED' || f.status === 'BLOCKED') continue
        if (f.dependencies.some(depId => blockedSet.has(depId))) {
          blockedSet.add(f.id)
          newlyBlocked.push(f.id)
          changed = true
        }
      }
    }

    for (const id of newlyBlocked) {
      this.updateFeatureStatus(id, 'BLOCKED')
    }

    return newlyBlocked
  }

  getExecutableFeatures(): Feature[] {
    const features = this.loadBacklog()
    const completedIds = new Set(
      features.filter(f => f.status === 'COMPLETED').map(f => f.id)
    )
    return features.filter(f =>
      f.status === 'NOT_STARTED' &&
      f.dependencies.every(depId => completedIds.has(depId))
    )
  }

  getNextTask(featureId: string): Task | null {
    const tasks = this.loadDevelopmentState()
    const candidates = tasks.filter(t => t.featureId === featureId && t.status === 'NOT_STARTED')
    return candidates[0] ?? null
  }

  // ─── Decisions log ────────────────────────────────────────────────────────

  appendDecision(entry: DecisionEntry): void {
    const path = join(this.productDir, 'DECISIONS.md')
    const existing = existsSync(path) ? readFileSync(path, 'utf-8') : ''
    const timestamp = new Date().toISOString()
    const feature = entry.featureId ?? 'GLOBAL'
    const scores = entry.scores ? `TL:${entry.scores.tl}, Adv:${entry.scores.adv}` : '-'
    const decision = entry.decision.replace(/\|/g, '&#124;')
    const rawRationale = entry.rationale ?? '-'
    const truncated = rawRationale.length > 200 ? rawRationale.slice(0, 200) + '...' : rawRationale
    const rationale = truncated.replace(/\|/g, '&#124;')
    const row = `| ${timestamp} | ${feature} | ${decision} | ${scores} | ${rationale} |`
    const trimmed = existing.trimEnd()
    atomicWrite(path, trimmed + '\n' + row + '\n')
  }

  loadRecentDecisions(n: number): string[] {
    const path = join(this.productDir, 'DECISIONS.md')
    if (!existsSync(path)) return []
    const content = readFileSync(path, 'utf-8')
    const dataRows = content.split('\n').filter(line => {
      if (!line.startsWith('|')) return false
      const cells = line.split('|').slice(1, -1)
      if (cells.length < 2) return false
      const first = cells[0].trim()
      // Skip header and separator rows
      if (first === '---' || first.toLowerCase() === 'timestamp') return false
      return true
    })
    return dataRows.slice(-n)
  }

  // ─── Rework log ───────────────────────────────────────────────────────────

  writeReworkLog(domain: string, content: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(domain)) {
      throw new Error('Invalid domain: path traversal detected')
    }
    const dir = join(this.workingDir, 'docs', 'specs', domain)
    mkdirSync(dir, { recursive: true })
    const path = join(dir, 'REWORK-LOG.md')
    const timestamp = new Date().toISOString()
    const entry = `\n## Rework — ${timestamp}\n\n${content}\n`
    const existing = existsSync(path) ? readFileSync(path, 'utf-8') : '# Rework Log\n'
    atomicWrite(path, existing + entry)
  }
}
