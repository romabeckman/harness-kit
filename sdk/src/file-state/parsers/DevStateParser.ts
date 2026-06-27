import type { Task, CurrentPhase, TaskStatus } from '../types'

function parseCell(cell: string): string {
  return cell.trim()
}

function normalizeId(cell: string): string {
  return cell.trim().replace(/\*\*/g, '').replace(/`/g, '')
}

function isCurrentPhase(s: string): s is CurrentPhase {
  return ['IMPLEMENTATION', 'VALIDATION', '-'].includes(s)
}

function isTaskStatus(s: string): s is TaskStatus {
  return ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'FAILED'].includes(s)
}

/**
 * Parses a DEVELOPMENT-STATE.md markdown table into Task[].
 * Columns: Feature ID | Task ID | Project | Description | Domain | Current Phase | Status
 */
export class DevStateParser {
  static parse(markdown: string): Task[] {
    const lines = markdown.split('\n').map(l => l.trim())
    const dataLines = lines.filter(l => {
      if (!l.startsWith('|')) return false
      if (l.replace(/\|/g, '').replace(/-/g, '').trim() === '') return false
      const cells = l.split('|').filter((_, i) => i > 0 && i < l.split('|').length - 1)
      if (cells.length < 2) return false
      const first = cells[0].trim()
      if (first === 'Feature ID' || first === '---') return false
      return true
    })

    const tasks: Task[] = []
    for (const line of dataLines) {
      try {
        const cells = line.split('|').slice(1, -1)
        if (cells.length < 7) continue
        const featureId = normalizeId(cells[0])
        if (!featureId || featureId === '---') continue
        const currentPhase = parseCell(cells[5])
        const status = parseCell(cells[6])
        tasks.push({
          featureId,
          taskId: normalizeId(cells[1]),
          project: parseCell(cells[2]),
          description: parseCell(cells[3]),
          domain: parseCell(cells[4]),
          currentPhase: isCurrentPhase(currentPhase) ? currentPhase : '-',
          status: isTaskStatus(status) ? status : 'NOT_STARTED',
        })
      } catch {
        // malformed row — skip gracefully
      }
    }
    return tasks
  }
}
