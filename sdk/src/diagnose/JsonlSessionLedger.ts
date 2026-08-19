import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isSessionStatus, type DiagnoseSessionRecord, type ISessionLedger, type SessionStatus } from './types'

export class JsonlSessionLedger implements ISessionLedger {
  readonly #ledgerPath: string

  constructor(ledgerPath: string) {
    this.#ledgerPath = ledgerPath
  }

  private writeAll(records: DiagnoseSessionRecord[]): void {
    const dir = dirname(this.#ledgerPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    const tempPath = join(dir, `.temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jsonl`)
    const lines = records.map((r) => JSON.stringify(r)).join('\n') + (records.length > 0 ? '\n' : '')
    writeFileSync(tempPath, lines, 'utf8')
    renameSync(tempPath, this.#ledgerPath)
  }

  append(record: DiagnoseSessionRecord): void {
    if (!existsSync(this.#ledgerPath)) {
      const dir = dirname(this.#ledgerPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      const line = JSON.stringify(record) + '\n'
      appendFileSync(this.#ledgerPath, line, 'utf8')
      return
    }

    const all = this.loadAll()
    const index = all.findIndex((r) => r.sessionId === record.sessionId)
    if (index >= 0) {
      all[index] = record
      this.writeAll(all)
    } else {
      const line = JSON.stringify(record) + '\n'
      appendFileSync(this.#ledgerPath, line, 'utf8')
    }
  }

  loadAll(): DiagnoseSessionRecord[] {
    if (!existsSync(this.#ledgerPath)) return []

    const content = readFileSync(this.#ledgerPath, 'utf8')
    const lines = content.split('\n')
    const records: DiagnoseSessionRecord[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const parsed = JSON.parse(trimmed)
        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof parsed.sessionId === 'string' &&
          isSessionStatus(parsed.status)
        ) {
          records.push(parsed as DiagnoseSessionRecord)
        }
      } catch {
        // skip malformed lines
      }
    }

    return records
  }

  loadPending(): DiagnoseSessionRecord[] {
    return this.loadAll().filter((record) => record.status === 'pending')
  }

  rewriteStatus(sessionId: string, status: SessionStatus): void {
    this.rewriteBatchStatuses({ [sessionId]: status })
  }

  rewriteBatchStatuses(statusMap: Record<string, SessionStatus> | Map<string, SessionStatus>): void {
    const all = this.loadAll()
    const getStatus = (id: string): SessionStatus | undefined =>
      statusMap instanceof Map ? statusMap.get(id) : statusMap[id]

    const updated = all.map((record) => {
      const newStatus = getStatus(record.sessionId)
      return newStatus ? { ...record, status: newStatus } : record
    })

    this.writeAll(updated)
  }
}
