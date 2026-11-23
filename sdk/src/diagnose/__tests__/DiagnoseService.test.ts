import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeCandidate } from './fixtures'
import { DiagnoseService } from '../DiagnoseService'
import type {
  ISessionLedger,
  DiagnoseSessionRecord,
  IMetaHarnessAgentAdapter,
} from '../types'
import { SessionIdGenerator } from '../SessionIdGenerator'
import { TraceDirectoryScanner } from '../TraceDirectoryScanner'
import type { HarnessSettings } from '../../settings/HarnessSettings'

describe('DiagnoseService', () => {
  let mockLedger: ISessionLedger
  let mockAdapter: IMetaHarnessAgentAdapter
  let mockScanner: TraceDirectoryScanner
  let idGenerator: SessionIdGenerator
  let pendingSessions: DiagnoseSessionRecord[]
  let workspace: string
  const settings = {
    hasSettings: () => true,
    resolve: (runner: string) => runner === 'claude-cli'
      ? { model: 'claude-sonnet-5', effort: 'high' }
      : runner === 'antigravity-cli' ? { model: 'gemini-3.8-flash', effort: 'low' } : {},
  } as unknown as HarnessSettings

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'diagnose-service-'))
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
          model: 'gpt-6-luna',
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
          model: 'gpt-6-luna',
          effort: 'xhigh',
          scopeSummary: 'Task 4',
          featureIds: ['F004'],
          phaseTimingsMs: { BOOTSTRAP: 250 },
        },
        timestamp: '2026-08-15T13:00:00.000Z',
      },
    ]

    mockLedger = {
      append: vi.fn(record => {
        const index = pendingSessions.findIndex(item => item.sessionId === record.sessionId)
        if (index === -1) pendingSessions.push(record)
        else pendingSessions[index] = record
      }),
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

  afterEach(() => rmSync(workspace, { recursive: true, force: true }))

  it('processes a single batch of 3 pending sessions and marks them completed', async () => {
    const service = new DiagnoseService({
      ledger: mockLedger,
      agentAdapter: mockAdapter,
      idGenerator,
      settings,
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
      settings,
    })

    await service.processNextBatch(2)
    expect(mockAdapter.invoke).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sessionId: 'session-2026-08-15-001' }),
      'session-2026-08-15-001',
      { model: 'claude-sonnet-5', effort: 'high' }
    )
    expect(mockAdapter.invoke).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sessionId: 'session-2026-08-15-002' }),
      'session-2026-08-15-002',
      { model: 'gemini-3.8-flash', effort: 'low' }
    )
  })

  it.each(['rejects', 'returns a failure'])('leaves a session pending when the agent %s', async (failure) => {
    const invoke = vi.fn<IMetaHarnessAgentAdapter['invoke']>()
      .mockResolvedValueOnce({ success: true, raw: 'OK' })
    if (failure === 'rejects') {
      invoke.mockRejectedValueOnce(new Error('Agent execution failed'))
    } else {
      invoke.mockResolvedValueOnce({ success: false, raw: 'Agent execution failed' })
    }
    mockAdapter.invoke = invoke

    const service = new DiagnoseService({
      ledger: mockLedger,
      agentAdapter: mockAdapter,
      idGenerator,
      settings,
    })

    const result = await service.processNextBatch(2)
    expect(result.processed).toBe(1)
    expect(mockLedger.rewriteStatus).toHaveBeenCalledWith('session-2026-08-15-001', 'completed')
    expect(mockLedger.rewriteStatus).not.toHaveBeenCalledWith('session-2026-08-15-002', 'completed')
    expect(mockLedger.loadPending()[0]).toMatchObject({
      sessionId: 'session-2026-08-15-002', traceId: 'session-2026-08-15-002',
    })
  })

  it('captures snapshot and appends pending session inline', async () => {
    const service = new DiagnoseService({
      ledger: mockLedger,
      agentAdapter: mockAdapter,
      idGenerator,
      settings,
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

  it('gives captures distinct source IDs before any trace has been created', async () => {
    const service = new DiagnoseService({ ledger: mockLedger, agentAdapter: mockAdapter, idGenerator, settings })
    const context = { runner: 'claude-cli' }

    const first = await service.captureSession({}, context)
    const second = await service.captureSession({}, context)

    expect(first.sessionId).not.toBe(second.sessionId)
  })

  it('reuses the trace ID reserved for a retry', async () => {
    const traceId = 'session-2026-08-15-005'
    pendingSessions[0] = { ...pendingSessions[0], traceId }
    const service = new DiagnoseService({ ledger: mockLedger, agentAdapter: mockAdapter, idGenerator, settings })

    await service.processNextBatch(1)

    expect(mockAdapter.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: pendingSessions[0].sessionId }), traceId, expect.anything(),
    )
  })

  it('uses the processed session when an older pending entry precedes an inline capture', async () => {
    const processed = pendingSessions[0]
    mockAdapter.invokeMetaHarness = vi.fn().mockResolvedValue({ success: true, raw: 'No proposal' })
    const service = new DiagnoseService({ ledger: mockLedger, agentAdapter: mockAdapter, idGenerator, settings })

    await service.captureAndProcessInline({}, { runner: 'cursor-cli' })

    expect(mockAdapter.invokeMetaHarness).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: processed.sessionId }), expect.anything(), [],
    )
  })

  it('calls invokeMetaHarness with the session when all pending sessions finish', async () => {
    pendingSessions[0].skill = 'harness-kit:tdd-orchestrator'
    mockAdapter.invokeMetaHarness = vi.fn().mockResolvedValue({ success: true, raw: 'Meta harness OK' })

    const service = new DiagnoseService({
      ledger: mockLedger,
      agentAdapter: mockAdapter,
      idGenerator,
      settings,
    })

    const result = await service.processAllPendingInBatches(10)
    expect(result.processed).toBe(4)
    expect(result.remaining).toBe(0)
    expect(mockAdapter.invokeMetaHarness).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-2026-08-15-001' }),
      { model: 'claude-sonnet-5', effort: 'high' },
      ['harness-kit:tdd-orchestrator'],
    )
  })

  it('captures candidate info and includes report data in processAllPendingInBatches result', async () => {
    mockAdapter.invokeMetaHarness = vi.fn(async () => {
      writeCandidate(workspace, 'v001', 'autonomous-orchestrator')
      return {
      success: true,
      raw: 'Candidate created',
      parsedJson: {
        candidateId: 'v001',
        targetSkill: 'autonomous-orchestrator',
        status: 'PROPOSED',
        decision: {
          action: 'EVALUATE_CANDIDATE',
        },
      },
      }
    })

    const service = new DiagnoseService({
      ledger: mockLedger,
      agentAdapter: mockAdapter,
      idGenerator,
      settings,
      workingDir: workspace,
    })

    const result = await service.processAllPendingInBatches(10)
    expect(result.processed).toBe(4)
    expect(result.candidateCreated).not.toBeNull()
    expect(result.candidateCreated?.candidateId).toBe('v001')
    expect(result.candidateCreated?.targetSkill).toBe('autonomous-orchestrator')
    expect(result.candidateCreated?.action).toBe('EVALUATE_CANDIDATE')
    expect(result.report).toBeDefined()
    expect(result.report?.processedSessions).toBe(4)
    expect(result.report?.sessionIds).toHaveLength(4)
  })

  it('does not report a pre-existing candidate as newly created', async () => {
    writeCandidate(workspace)
    mockAdapter.invokeMetaHarness = vi.fn().mockResolvedValue({
      success: true,
      raw: '{"candidateId":"v001","targetSkill":"tdd-orchestrator","status":"PROPOSED","decision":{"action":"EVALUATE_CANDIDATE"}}',
    })
    const service = new DiagnoseService({
      ledger: mockLedger, agentAdapter: mockAdapter, idGenerator, settings, workingDir: workspace,
    })

    const result = await service.processAllPendingInBatches()

    expect(result.candidateCreated).toBeNull()
    expect(result.report?.optimization?.status).toBe('failed')
  })
})
