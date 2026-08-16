import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { ITraceDirectoryScanner } from './types'
import { DiagnosePaths } from './utils/DiagnosePaths'

export class TraceDirectoryScanner implements ITraceDirectoryScanner {
  private readonly tracesDir: string

  constructor(workspacePath: string) {
    this.tracesDir = DiagnosePaths.tracesDir(workspacePath)
  }

  private resolveDate(date?: string): string {
    return date ?? new Date().toISOString().slice(0, 10)
  }

  scanExistingSessionDirs(date?: string): string[] {
    const targetDate = this.resolveDate(date)
    if (!existsSync(this.tracesDir)) return []

    const entries = readdirSync(this.tracesDir)
    const regex = new RegExp(`^session-${targetDate}-(\\d{3,})$`)

    return entries.filter((entry) => {
      const fullPath = join(this.tracesDir, entry)
      try {
        if (!statSync(fullPath).isDirectory()) return false
      } catch {
        return false
      }
      return regex.test(entry)
    })
  }

  getNextSequenceNumber(date?: string): number {
    const targetDate = this.resolveDate(date)
    const sessionDirs = this.scanExistingSessionDirs(targetDate)
    if (sessionDirs.length === 0) return 1

    const regex = new RegExp(`^session-${targetDate}-(\\d{3,})$`)
    let maxSeq = 0

    for (const dir of sessionDirs) {
      const match = regex.exec(dir)
      if (match && match[1]) {
        const seq = parseInt(match[1], 10)
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq
        }
      }
    }

    return maxSeq + 1
  }
}
