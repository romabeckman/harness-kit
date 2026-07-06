import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { IFileStateManager } from '../../file-state/FileStateManager'
import type { OnDiskState } from '../types'
import { ExtractedTask } from '../phases'

export class ProjectStateService {
  constructor(private readonly workingDir: string) { }

  checkSpecFilesPresent(domain: string): boolean {
    const specsDir = join(this.workingDir, 'docs', 'specs', domain)
    return existsSync(specsDir)
  }

  extractTasksFromTacticalDesign(domain: string): ExtractedTask[] {
    const specsDir = join(this.workingDir, 'docs', 'specs', domain)
    const files = existsSync(specsDir)
      ? readdirSync(specsDir).filter(f => f.match(/^003-.*tactical-design.*\.md$/i))
      : []
    const extractedTasks: ExtractedTask[] = []

    if (files.length === 0) return extractedTasks

    for (const file of files) {
      const content = readFileSync(join(specsDir, file), 'utf8')
      const tasks = ProjectStateService._parseTasksFromMarkdown(content, file)
      extractedTasks.push(...tasks)
    }
    return extractedTasks
  }

  // This method is public for testing purposes.
  public static _parseTasksFromMarkdown(content: string, file: string): ExtractedTask[] {
    const section6Match = content.match(/## Section 6[^\n]*\n([\s\S]*?)(?=\n## |$)/i)
    if (!section6Match) return []

    const section = section6Match[1]

    // Extract JSON array from fenced code block (```json ... ``` or ``` ... ```)
    const fenceMatch = section.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const rawJson = fenceMatch ? fenceMatch[1].trim() : section.trim()
    if (!rawJson) return []

    let parsed: unknown
    try {
      parsed = JSON.parse(rawJson)
    } catch {
      return []
    }
    if (!Array.isArray(parsed)) return []

    const fileNameMatch = file.match(/^003-(.*?)-tactical-design.*$/i)
    const extractedFile = fileNameMatch ? fileNameMatch[1] : file

    return parsed
      .filter(
        (item): item is { id: string | number; title: string } =>
          typeof item === 'object' &&
          item !== null &&
          (typeof (item as Record<string, unknown>).id === 'string' ||
            typeof (item as Record<string, unknown>).id === 'number') &&
          typeof (item as Record<string, unknown>).title === 'string',
      )
      .map(item => ({
        // Convertendo o id para String antes de chamar o replace
        taskId: `T${String(item.id).replace(/\D/g, '').padStart(2, '0')}`,
        description: item.title,
        file: extractedFile
      }))
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
