import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DiagnoseService } from '../DiagnoseService'
import type {
  ISessionLedger,
  DiagnoseSessionRecord,
  IMetaHarnessAgentAdapter,
} from '../types'
import { SessionIdGenerator } from '../SessionIdGenerator'
import { TraceDirectoryScanner } from '../TraceDirectoryScanner'

describe('DiagnoseService', () => {
  let mockLedger: ISessionLedger
  let mockAdapter: IMetaHarnessAgentAdapter
  let mockScanner: TraceDirectoryScanner
  let idGenerator: SessionIdGenerator
  let pendingSessions: DiagnoseSessionRecord[]

  beforeEach(() => {
    pendingSessions = [
      {
        sessionId: 'session-2026-08-15-001',
        runner: 'claude-cli',
        agent: 'developer-backend',
        status: 'pending',
        snapshot: {
          runner: 'claude-cli',
          model: 'anthropic.claude-5-sonnet',
          effort: 'medium',
          scopeSummary: 'Task 1',
          featureIds: ['F001'],
          phaseTimingsMs: { BOOTSTRAP: 100 },
        },
        timestamp: '2026-08-15T10:00:00.000Z',
      },
      {
        sessionId: 'session-2026-08-15-002',
        runner: 'antigravity-cli',
        agent: 'developer-backend',
        status: 'pending',
        snapshot: {
          runner: 'antigravity-cli',
          model: 'gemini-3.7-flash',
          effort: 'low',
          scopeSummary: 'Task 2',
          featureIds: ['F002'],
          phaseTimingsMs: { BOOTSTRAP: 150 },
        },
        timestamp: '2026-08-15T11:00:00.000Z',
      },
      {
        sessionId: 'session-2026-08-15-003',
        runner: 'copilot-cli',
        agent: 'developer-backend',
        status: 'pending',
        snapshot: {
          runner: 'copilot-cli',
          model: 'gpt-5.6-luna',
          effort: 'xhigh',
          scopeSummary: 'Task 3',
          featureIds: ['F003'],
          phaseTimingsMs: { BOOTSTRAP: 200 },
        },
        timestamp: '2026-08-15T12:00:00.000Z',
      },
      {
        sessionId: 'session-2026-08-15-004',
        runner: 'cursor-cli',
        agent: 'developer-backend',
        status: 'pending',
        snapshot: {
          runner: 'cursor-cli',
          model: 'gpt-5.6-luna',
          effort: 'xhigh',
          scopeSummary: 'Task 4',
          featureIds: ['F004'],
          phaseTimingsMs: { BOOTSTRAP: 250 },
        },
        timestamp: '2026-08-15T13:00:00.000Z',
      },
    ]

    mockLedger = {
      append: vi.fn((record) => pendingSessions.push(record)),
      loadAll: vi.fn(() => [...pendingSessions]),
      loadPending: vi.fn(() => pendingSessions.filter((s) => s.status === 'pending')),
      rewriteStatus: vi.fn((id, status) => {
        const found = pendingSessions.find((s) => s.sessionId === id)
        if (found) found.status = status
      }),
    }

    mockAdapter = {
      invoke: vi.fn().mockResolvedValue({ success: true, raw: 'Optimization proposed' }),
    }

    mockScanner = {
      getNextSequenceNumber: vi.fn().mockReturnValue(1),
      scanExistingSessionDirs: vi.fn().mockReturnValue([]),
    } as any

    idGenerator = new SessionIdGenerator(mockScanner)
  })

  it('processes a single batch of 3 pending sessions and marks them completed', async () => {
    const service = new DiagnoseService({
      ledger: mockLedger,
      agentAdapter: mockAdapter,
      idGenerator,
    })

    const result = await service.processNextBatch(3)
    expect(result.processed).toBe(3)
    expect(result.remaining).toBe(1)
    expect(mockAdapter.invoke).toHaveBeenCalledTimes(3)
    expect(mockLedger.rewriteStatus).toHaveBeenCalledWith('session-2026-08-15-001', 'completed')
    expect(mockLedger.rewriteStatus).toHaveBeenCalledWith('session-2026-08-15-002', 'completed')
    expect(mockLedger.rewriteStatus).toHaveBeenCalledWith('session-2026-08-15-003', 'completed')
  })

  it('pre-computes session IDs and passes them to agent adapter', async () => {
    const service = new DiagnoseService({
      ledger: mockLedger,
      agentAdapter: mockAdapter,
      idGenerator,
    })

    await service.processNextBatch(2)
    expect(mockAdapter.invoke).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sessionId: 'session-2026-08-15-001' }),
      'session-2026-08-15-001',
      undefined
    )
    expect(mockAdapter.invoke).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sessionId: 'session-2026-08-15-002' }),
      'session-2026-08-15-002',
      undefined
    )
  })

  it('leaves failed session as pending on agent error', async () => {
    mockAdapter.invoke = vi.fn()
      .mockResolvedValueOnce({ success: true, raw: 'OK' })
      .mockRejectedValueOnce(new Error('Agent execution failed'))

    const service = new DiagnoseService({
      ledger: mockLedger,
      agentAdapter: mockAdapter,
      idGenerator,
    })

    const result = await service.processNextBatch(2)
    expect(result.processed).toBe(1)
    expect(mockLedger.rewriteStatus).toHaveBeenCalledWith('session-2026-08-15-001', 'completed')
    expect(mockLedger.rewriteStatus).not.toHaveBeenCalledWith('session-2026-08-15-002', 'completed')
  })

  it('captures snapshot and appends pending session inline', async () => {
    const service = new DiagnoseService({
      ledger: mockLedger,
      agentAdapter: mockAdapter,
      idGenerator,
    })

    const mockOrchestrator: any = {
      config: {
        scope: 'Inline test scope',
      },
      state: {
        completedCycles: 1,
      },
      fsm: {
        loadBacklog: () => [{ id: 'F001' }, { id: 'F002' }],
      },
    }

    const record = await service.captureSession(mockOrchestrator, {
      runner: 'claude-cli',
      model: 'anthropic.claude-5-sonnet',
      effort: 'medium',
      phaseTimingsMs: { BOOTSTRAP: 100 },
    })

    expect(record.status).toBe('pending')
    expect(record.snapshot?.scopeSummary).toBe('Inline test scope')
    expect(record.snapshot?.featureIds).toEqual(['F001', 'F002'])
    expect(mockLedger.append).toHaveBeenCalledWith(record)
  })

  it('calls invokeMetaHarness with the session when all pending sessions finish', async () => {
    mockAdapter.invokeMetaHarness = vi.fn().mockResolvedValue({ success: true, raw: 'Meta harness OK' })

    const service = new DiagnoseService({
      ledger: mockLedger,
      agentAdapter: mockAdapter,
      idGenerator,
    })

    const result = await service.processAllPendingInBatches(10)
    expect(result.processed).toBe(4)
    expect(result.remaining).toBe(0)
    expect(mockAdapter.invokeMetaHarness).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-2026-08-15-001' }),
      undefined
    )
  })
})
