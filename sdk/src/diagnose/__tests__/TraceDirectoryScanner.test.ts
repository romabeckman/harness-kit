import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { TraceDirectoryScanner } from '../TraceDirectoryScanner'

describe('TraceDirectoryScanner', () => {
  let testDir: string
  let tracesDir: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'harness-scanner-test-'))
    tracesDir = join(testDir, 'docs', 'harness-history', 'traces')
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('returns 1 when traces directory does not exist or is empty', () => {
    const scanner = new TraceDirectoryScanner(testDir)
    expect(scanner.getNextSequenceNumber('2026-08-15')).toBe(1)
    expect(scanner.scanExistingSessionDirs('2026-08-15')).toEqual([])
  })

  it('returns next sequence number based on existing session directories for the target date', () => {
    mkdirSync(join(tracesDir, 'session-2026-08-15-001'), { recursive: true })
    mkdirSync(join(tracesDir, 'session-2026-08-15-002'), { recursive: true })
    mkdirSync(join(tracesDir, 'session-2026-08-14-005'), { recursive: true }) // Different date

    const scanner = new TraceDirectoryScanner(testDir)
    const existing = scanner.scanExistingSessionDirs('2026-08-15')
    expect(existing).toEqual(['session-2026-08-15-001', 'session-2026-08-15-002'])
    expect(scanner.getNextSequenceNumber('2026-08-15')).toBe(3)
  })

  it('handles non-sequential or gapped session numbers by taking max + 1', () => {
    mkdirSync(join(tracesDir, 'session-2026-08-15-001'), { recursive: true })
    mkdirSync(join(tracesDir, 'session-2026-08-15-010'), { recursive: true })

    const scanner = new TraceDirectoryScanner(testDir)
    expect(scanner.getNextSequenceNumber('2026-08-15')).toBe(11)
  })

  it('ignores malformed directory names and non-directory files', () => {
    mkdirSync(join(tracesDir, 'session-2026-08-15-invalid'), { recursive: true })
    mkdirSync(join(tracesDir, 'other-folder'), { recursive: true })
    mkdirSync(join(tracesDir, 'session-2026-08-15-003'), { recursive: true })

    const scanner = new TraceDirectoryScanner(testDir)
    expect(scanner.scanExistingSessionDirs('2026-08-15')).toEqual(['session-2026-08-15-003'])
    expect(scanner.getNextSequenceNumber('2026-08-15')).toBe(4)
  })

  it('defaults to current UTC/local date when date is omitted', () => {
    const today = new Date().toISOString().slice(0, 10)
    mkdirSync(join(tracesDir, `session-${today}-001`), { recursive: true })

    const scanner = new TraceDirectoryScanner(testDir)
    expect(scanner.getNextSequenceNumber()).toBe(2)
  })
})
