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
  cliSettings?: DiagnoseSettings
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
  private readonly cliSettings?: DiagnoseSettings

  constructor(options: DiagnoseServiceOptions) {
    this.ledger = options.ledger
    this.agentAdapter = options.agentAdapter
    this.idGenerator = options.idGenerator
    this.settings = options.settings ?? HarnessSettings.load(options.workingDir)
    this.cliSettings = options.cliSettings
  }

  private resolveDiagnoseSettings(runnerType: string): DiagnoseSettings | undefined {
    if (this.cliSettings && (this.cliSettings.model || this.cliSettings.effort)) {
      return this.cliSettings
    }

    const key = this.settings.hasSettings(runnerType) ? runnerType : runnerType.split('-')[0]
    const phaseSettings = this.settings.resolve(key, 'diagnose')
    const model = phaseSettings.model && phaseSettings.model.trim().length > 0 ? phaseSettings.model.trim() : undefined
    const effort = phaseSettings.effort && phaseSettings.effort.trim().length > 0 ? phaseSettings.effort.trim() : undefined
    if (model || effort) {
      return {
        model: model ?? '',
        effort: effort ?? '',
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
    let lastProcessedSession: DiagnoseSessionRecord | undefined

    while (true) {
      const pending = this.ledger.loadPending()
      if (pending.length > 0) {
        lastProcessedSession = pending[0]
      }

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

    if (totalProcessed > 0 && lastProcessedSession && this.agentAdapter.invokeMetaHarness) {
      try {
        const settings = this.resolveDiagnoseSettings(lastProcessedSession.runner)
        await this.agentAdapter.invokeMetaHarness(lastProcessedSession, settings)
      } catch (err) {
        console.error('[DiagnoseService] Error invoking meta-harness proposal:', err)
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
    const record = await this.captureSession(orchestrator, context)
    await this.processNextBatch(1)
    if (this.agentAdapter.invokeMetaHarness) {
      try {
        const settings = this.resolveDiagnoseSettings(record.runner)
        await this.agentAdapter.invokeMetaHarness(record, settings)
      } catch (err) {
        console.error('[DiagnoseService] Error invoking meta-harness proposal:', err)
      }
    }
  }
}
