import { randomUUID } from 'node:crypto'
import { constants, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { DebugContext } from '../../cli/DebugContext'

export function saveDebugReportCopy(path: string): void {
  if (!DebugContext.enabled || !existsSync(path)) return
  const name = basename(path, '.json')
  try {
    const directory = join(dirname(path), '.debug')
    mkdirSync(directory, { recursive: true })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    copyFileSync(path, join(directory, `${name}-${timestamp}-${randomUUID()}.json`), constants.COPYFILE_EXCL)
  } catch (error) {
    console.warn(`[debug] Could not preserve ${name}.json:`, error)
  }
}
