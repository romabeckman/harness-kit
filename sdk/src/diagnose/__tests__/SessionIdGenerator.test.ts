import { describe, it, expect, vi } from 'vitest'
import { SessionIdGenerator } from '../SessionIdGenerator'
import type { ITraceDirectoryScanner } from '../types'

describe('SessionIdGenerator', () => {
  it('generates session ID with zero-padded NNN using scanner', () => {
    const mockScanner: ITraceDirectoryScanner = {
      getNextSequenceNumber: vi.fn().mockReturnValue(1),
      scanExistingSessionDirs: vi.fn().mockReturnValue([]),
    }

    const generator = new SessionIdGenerator(mockScanner)
    const id = generator.generate('2026-08-15')
    expect(id).toBe('session-2026-08-15-001')
  })

  it('increments sequence number based on offset', () => {
    const mockScanner: ITraceDirectoryScanner = {
      getNextSequenceNumber: vi.fn().mockReturnValue(5),
      scanExistingSessionDirs: vi.fn().mockReturnValue([]),
    }

    const generator = new SessionIdGenerator(mockScanner)
    expect(generator.generate('2026-08-15', 0)).toBe('session-2026-08-15-005')
    expect(generator.generate('2026-08-15', 1)).toBe('session-2026-08-15-006')
    expect(generator.generate('2026-08-15', 2)).toBe('session-2026-08-15-007')
  })

  it('generates a batch of N session IDs', () => {
    const mockScanner: ITraceDirectoryScanner = {
      getNextSequenceNumber: vi.fn().mockReturnValue(10),
      scanExistingSessionDirs: vi.fn().mockReturnValue([]),
    }

    const generator = new SessionIdGenerator(mockScanner)
    const batch = generator.generateBatch(3, '2026-08-15')
    expect(batch).toEqual([
      'session-2026-08-15-010',
      'session-2026-08-15-011',
      'session-2026-08-15-012',
    ])
  })

  it('handles 3+ digits for sequence numbers above 999', () => {
    const mockScanner: ITraceDirectoryScanner = {
      getNextSequenceNumber: vi.fn().mockReturnValue(1005),
      scanExistingSessionDirs: vi.fn().mockReturnValue([]),
    }

    const generator = new SessionIdGenerator(mockScanner)
    expect(generator.generate('2026-08-15')).toBe('session-2026-08-15-1005')
  })

  it('defaults to current date if omitted', () => {
    const today = new Date().toISOString().slice(0, 10)
    const mockScanner: ITraceDirectoryScanner = {
      getNextSequenceNumber: vi.fn().mockReturnValue(2),
      scanExistingSessionDirs: vi.fn().mockReturnValue([]),
    }

    const generator = new SessionIdGenerator(mockScanner)
    expect(generator.generate()).toBe(`session-${today}-002`)
  })
})
