import type { ITraceDirectoryScanner } from './types'

export class SessionIdGenerator {
  constructor(private readonly scanner: ITraceDirectoryScanner) {}

  private resolveDate(date?: string): string {
    return date ?? new Date().toISOString().slice(0, 10)
  }

  private formatId(date: string, seq: number): string {
    const padded = String(seq).padStart(3, '0')
    return `session-${date}-${padded}`
  }

  generate(date?: string, offset = 0): string {
    const targetDate = this.resolveDate(date)
    const baseSeq = this.scanner.getNextSequenceNumber(targetDate)
    return this.formatId(targetDate, baseSeq + offset)
  }

  generateBatch(count: number, date?: string): string[] {
    const targetDate = this.resolveDate(date)
    const baseSeq = this.scanner.getNextSequenceNumber(targetDate)
    const result: string[] = []

    for (let i = 0; i < count; i++) {
      result.push(this.formatId(targetDate, baseSeq + i))
    }

    return result
  }
}
