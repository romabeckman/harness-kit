import type {
  DiagnoseSessionRecord,
  DiagnoseSettings,
  IMetaHarnessAgentAdapter,
  ISessionLedger,
  SessionSnapshot,
} from './types'
import { sanitizeSessionSnapshot } from './types'
import type { SessionIdGenerator } from './SessionIdGenerator'
import { HarnessSettings } from '../settings/HarnessSettings'

export interface DiagnoseServiceOptions {
  ledger: ISessionLedger
  agentAdapter: IMetaHarnessAgentAdapter
  idGenerator: SessionIdGenerator
  settings?: HarnessSettings
  workingDir?: string
}

export interface BatchResult {
  processed: number
  remaining: number
}

export interface CaptureContext {
  runner: string
  agent?: string
  model?: string
  effort?: string
  phaseTimingsMs?: Record<string, number>
}

export class DiagnoseService {
  private readonly ledger: ISessionLedger
  private readonly agentAdapter: IMetaHarnessAgentAdapter
  private readonly idGenerator: SessionIdGenerator
  private readonly settings: HarnessSettings

  constructor(options: DiagnoseServiceOptions) {
    this.ledger = options.ledger
    this.agentAdapter = options.agentAdapter
    this.idGenerator = options.idGenerator
    this.settings = options.settings ?? HarnessSettings.load(options.workingDir)
  }

  private resolveDiagnoseSettings(runnerType: string): DiagnoseSettings | undefined {
    const key = this.settings.hasSettings(runnerType) ? runnerType : runnerType.split('-')[0]
    const phaseSettings = this.settings.resolve(key, 'diagnose')
    if (phaseSettings.model || phaseSettings.effort) {
      return {
        model: phaseSettings.model ?? '',
        effort: phaseSettings.effort ?? '',
      }
    }
    return undefined
  }

  async processNextBatch(batchSize = 3): Promise<BatchResult> {
    const pending = this.ledger.loadPending()
    if (pending.length === 0) {
      return { processed: 0, remaining: 0 }
    }

    const batch = pending.slice(0, batchSize)
    const dateOffsets: Record<string, number> = {}
    let processed = 0

    for (let i = 0; i < batch.length; i++) {
      const session = batch[i]
      const date = session.timestamp ? session.timestamp.slice(0, 10) : new Date().toISOString().slice(0, 10)
      const offset = dateOffsets[date] ?? 0
      dateOffsets[date] = offset + 1

      const preComputedId = this.idGenerator.generate(date, offset)
      const settings = this.resolveDiagnoseSettings(session.runner)

      try {
        await this.agentAdapter.invoke(session, preComputedId, settings)
        this.ledger.rewriteStatus(session.sessionId, 'completed')
        processed++
      } catch (err) {
        // Leave session as pending on failure so it can retry next time
        console.error(`[DiagnoseService] Error diagnosing session ${session.sessionId}:`, err)
      }
    }

    const remaining = this.ledger.loadPending().length
    return { processed, remaining }
  }

  async processAllPendingInBatches(
    batchSize = 3,
    onProgress?: (batchResult: BatchResult) => boolean | void
  ): Promise<BatchResult> {
    let totalProcessed = 0
    let lastRemaining = 0

    while (true) {
      const result = await this.processNextBatch(batchSize)
      if (result.processed === 0) {
        lastRemaining = result.remaining
        break
      }

      totalProcessed += result.processed
      lastRemaining = result.remaining

      if (onProgress) {
        const shouldContinue = onProgress(result)
        if (shouldContinue === false) {
          break
        }
      }

      if (result.remaining === 0) {
        break
      }
    }

    return { processed: totalProcessed, remaining: lastRemaining }
  }

  async captureSession(
    orchestrator: any,
    context: CaptureContext
  ): Promise<DiagnoseSessionRecord> {
    let scopeSummary = orchestrator.config?.scope ?? ''
    if (!scopeSummary && orchestrator.fsm?.existScope && orchestrator.fsm.existScope()) {
      try {
        scopeSummary = orchestrator.fsm.loadScope()
      } catch {
        // ignore
      }
    }

    let featureIds: string[] = []
    if (orchestrator.fsm?.loadBacklog) {
      try {
        const features = orchestrator.fsm.loadBacklog()
        if (Array.isArray(features)) {
          featureIds = features.map((f: any) => f.id).filter(Boolean)
        }
      } catch {
        // ignore
      }
    }

    const rawSnapshot = {
      runner: context.runner,
      model: context.model ?? '',
      effort: context.effort ?? '',
      scopeSummary,
      featureIds,
      phaseTimingsMs: context.phaseTimingsMs ?? {},
    }

    const snapshot: SessionSnapshot = sanitizeSessionSnapshot(rawSnapshot)
    const timestamp = new Date().toISOString()
    const date = timestamp.slice(0, 10)
    const sessionId = this.idGenerator.generate(date)

    const record: DiagnoseSessionRecord = {
      sessionId,
      runner: context.runner,
      agent: context.agent ?? 'orchestrator',
      status: 'pending',
      snapshot,
      timestamp,
    }

    this.ledger.append(record)
    return record
  }

  async captureAndProcessInline(
    orchestrator: any,
    context: CaptureContext
  ): Promise<void> {
    await this.captureSession(orchestrator, context)
    await this.processNextBatch(1)
  }
}
