import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { IFileStateManager } from '../../file-state/FileStateManager'
import type { OnDiskState } from '../types'

export class ProjectStateService {
  constructor(private readonly workingDir: string) {}

  checkSpecFilesPresent(domain: string): boolean {
    const specsDir = join(this.workingDir, 'docs', 'specs', domain)
    return existsSync(specsDir)
  }

  extractTasksFromTacticalDesign(domain: string): Array<{ taskId: string; description: string }> {
    const specsDir = join(this.workingDir, 'docs', 'specs', domain)
    const files = existsSync(specsDir)
      ? readdirSync(specsDir).filter(f => f.match(/^003-.*tactical-design.*\.md$/i))
      : []

    if (files.length === 0) return []

    const content = readFileSync(join(specsDir, files[0]), 'utf8')

    // Find Section 6
    const section6Match = content.match(/## Section 6[^\n]*\n([\s\S]*?)(?=\n## |$)/i)
    if (!section6Match) return []

    const section = section6Match[1]
    const tasks: Array<{ taskId: string; description: string }> = []

    // Parse Task ID / Description blocks (fenced or plain)
    const taskBlocks = section.split(/(?=Task ID\s*:)/i).filter(b => b.trim())

    for (const block of taskBlocks) {
      const idMatch = block.match(/Task ID\s*:\s*(\S+)/i)
      const descMatch = block.match(/Description\s*:\s*(.+)/i)
      if (idMatch && descMatch) {
        const rawId = idMatch[1].replace(/[^a-zA-Z0-9]/g, '')
        tasks.push({
          taskId: `T${rawId.padStart(2, '0')}`,
          description: descMatch[1].trim(),
        })
      }
    }

    return tasks
  }

  readOnDiskState(fsm: IFileStateManager, productDir: string): OnDiskState {
    const productFilesExist =
      existsSync(join(productDir, 'BACKLOG.md')) &&
      existsSync(join(productDir, 'DEVELOPMENT-STATE.md')) &&
      existsSync(join(productDir, 'DECISIONS.md')) &&
      existsSync(join(productDir, 'BOOTSTRAP-CONFIG.json'))

    if (!productFilesExist) {
      return {
        productFilesExist: false,
        features: [],
        tasks: [],
        config: null,
        activeFeature: null,
        specFilesPresent: false,
        tddOutputPresent: false,
        allTasksCompleted: false,
      }
    }

    const features = fsm.loadBacklog()
    const tasks = fsm.loadDevelopmentState()
    const config = fsm.loadBootstrapConfig()

    const activeFeature =
      features.find(f => f.status === 'IN_PROGRESS') ??
      features.find(f => f.status === 'NOT_STARTED') ??
      null

    const domain = activeFeature?.domain ?? ''
    const specFilesPresent = domain ? this.checkSpecFilesPresent(domain) : false
    const tddOutputPath = domain
      ? join(this.workingDir, 'docs', 'specs', domain, 'TDD-OUTPUT.json')
      : ''
    const tddOutputPresent = tddOutputPath ? existsSync(tddOutputPath) : false

    const featureTasks = activeFeature
      ? tasks.filter(t => t.featureId === activeFeature.id)
      : []
    const allTasksCompleted =
      featureTasks.length > 0 && featureTasks.every(t => t.status === 'COMPLETED')

    return {
      productFilesExist: true,
      features,
      tasks,
      config,
      activeFeature,
      specFilesPresent,
      tddOutputPresent,
      allTasksCompleted,
    }
  }
}
