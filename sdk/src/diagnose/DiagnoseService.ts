import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import type {
  CandidateReportInfo,
  DiagnoseReportData,
  DiagnoseSessionRecord,
  DiagnoseSettings,
  IMetaHarnessAgentAdapter,
  ISessionLedger,
  SessionSnapshot,
} from './types'
import { isDiagnoseSession, sanitizeSessionSnapshot } from './types'
import type { SessionIdGenerator } from './SessionIdGenerator'
import { CandidateReader } from './CandidateReader'
import { HarnessSettings } from '../settings/HarnessSettings'
import type { DreamingEpisodeStore } from '../file-state/DreamingEpisodeStore'
import { dreamingFingerprint, validateDreamingReceipt } from '../file-state/DreamingAnalysis'

export interface DiagnoseServiceOptions {
  ledger: ISessionLedger
  agentAdapter: IMetaHarnessAgentAdapter
  idGenerator: SessionIdGenerator
  settings?: HarnessSettings
  cliSettings?: DiagnoseSettings
  workingDir?: string
  dreaming?: DreamingEpisodeStore
  dreamingTarget?: { project: string; episodeId: string }
}

export interface BatchResult {
  processed: number
  remaining: number
  sessionIds?: string[]
  traceIds?: string[]
  candidateCreated?: CandidateReportInfo | null
  report?: DiagnoseReportData
  dreaming?: {
    processed: number
    pending: number
    eligible?: number
    created?: number
    updated?: number
    noHypothesis?: number
    historicalUnknown?: number
    pendingDetails?: { episodeId: string; project: string; reason: string }[]
    decisions?: { episodeId: string; project: string; status: string; reason: string }[]
  }
}

export interface CaptureContext {
  runner: string
  sessionId?: string
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
  private readonly workingDir: string
  private readonly dreaming?: DreamingEpisodeStore
  private readonly dreamingTarget?: { project: string; episodeId: string }

  constructor(options: DiagnoseServiceOptions) {
    this.ledger = options.ledger
    this.agentAdapter = options.agentAdapter
    this.idGenerator = options.idGenerator
    this.settings = options.settings ?? HarnessSettings.load(options.workingDir)
    this.cliSettings = options.cliSettings
    this.workingDir = options.workingDir ?? process.cwd()
    this.dreaming = options.dreaming
    this.dreamingTarget = options.dreamingTarget
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

  private async proposeCandidate(
    session: DiagnoseSessionRecord,
    completed: readonly DiagnoseSessionRecord[]
  ): Promise<Pick<DiagnoseReportData, 'candidateCreated' | 'optimization'>> {
    if (!this.agentAdapter.invokeMetaHarness) {
      return { candidateCreated: null }
    }
    try {
      const settings = this.resolveDiagnoseSettings(session.runner)
      const skills = completed.flatMap(record => record.skill ? [record.skill] : [])
      const existingCandidates = CandidateReader.listCandidateIds(this.workingDir)
      const output = await this.agentAdapter.invokeMetaHarness(session, settings, skills, completed)
      return CandidateReader.resolveProposal(output, this.workingDir, existingCandidates)
    } catch (err) {
      console.error('[DiagnoseService] Error invoking meta-harness proposal:', err)
      return { candidateCreated: null, optimization: { status: 'failed', reason: 'The optimization runner failed. See the error above.' } }
    }
  }

  private async processDreaming(completed: DiagnoseSessionRecord[]): Promise<BatchResult['dreaming']> {
    if (!this.dreaming || !this.agentAdapter.invokeProjectDreaming) return undefined
    const counts: NonNullable<BatchResult['dreaming']> = { processed: 0, pending: 0, eligible: 0, created: 0, updated: 0, noHypothesis: 0, historicalUnknown: 0 }
    const pendingDetails: NonNullable<typeof counts.pendingDetails> = []
    const decisions: NonNullable<typeof counts.decisions> = []
    const episodes = this.dreaming.list().filter(episode => episode.closed)
    for (const episode of episodes) {
      for (const project of episode.projects) {
        const target = this.dreamingTarget
        if (target && (episode.id !== target.episodeId || (project.root !== target.project && project.root !== resolve(this.workingDir, target.project)))) continue
        if (!target && episodes.some(item => item.previousAttemptId === episode.id && item.projects.some(owner => owner.root === project.root))) continue
        counts.eligible!++
        const chain = this.dreaming.learningChain(episode, project.root)
        const fingerprint = dreamingFingerprint(chain.attempts)
        if (!target && project.processed && !project.analysis) {
          counts.historicalUnknown!++
          decisions.push({ episodeId: episode.id, project: project.root, status: 'historical_unknown', reason: 'Historical outcome unknown: no receipt was saved.' })
          continue
        }
        if (!target && project.analysis?.receipt.status !== 'incomplete' && project.analysis?.fingerprint === fingerprint) continue
        const markPending = (reason: string): void => {
          counts.pending++
          pendingDetails.push({
            episodeId: episode.id,
            project: project.root,
            reason: reason.replaceAll('\u001b', '').replace(/\s+/g, ' ').trim().slice(0, 500) || 'The runner returned no error details.',
          })
          const receipt = validateDreamingReceipt(JSON.stringify({ episode_id: episode.id, status: 'incomplete', reason }), project.root, episode.id, chain.attempts.map(item => item.id))
          this.dreaming!.recordAnalysis(episode.id, project.root, fingerprint, receipt)
        }
        if (chain.error) { markPending(chain.error); continue }
        const sessions = completed.filter(record => record.traceId && chain.attempts.some(item => item.sourceSessions.includes(record.sessionId))
          && (record.featureId === undefined || record.featureId === episode.featureId)
          && (record.domain === undefined || record.domain === episode.domain))
        if (!sessions.length) {
          markPending('No completed eligible session with a trace is linked to this episode.')
          continue
        }
        try {
          const output = await this.agentAdapter.invokeProjectDreaming(
            episode, project, sessions, undefined, this.resolveDiagnoseSettings(sessions[0].runner), chain.attempts,
          )
          if (output.success === false) {
            markPending(output.raw)
            continue
          }
          const receipt = validateDreamingReceipt(output.raw, project.root, episode.id, chain.attempts.map(item => item.id))
          if (receipt.status === 'incomplete') { markPending(receipt.reason ?? 'Invalid Dreaming receipt.'); continue }
          this.dreaming.recordAnalysis(episode.id, project.root, fingerprint, receipt)
          counts.processed++
          if (receipt.status === 'no_hypothesis') counts.noHypothesis!++
          decisions.push({ episodeId: episode.id, project: project.root, status: receipt.status, reason: receipt.reason ?? (receipt.hypotheses ?? []).map(item => `${item.id}: ${item.disposition}`).join(', ') })
          for (const item of receipt.hypotheses ?? []) {
            if (item.disposition === 'created') counts.created!++
            if (item.disposition === 'updated') counts.updated!++
          }
        } catch (error) {
          markPending(error instanceof Error ? error.message : String(error))
        }
      }
    }
    return { ...counts, ...(pendingDetails.length ? { pendingDetails } : {}), ...(decisions.length ? { decisions } : {}) }
  }

  async processNextBatch(batchSize = 3): Promise<BatchResult> {
    const pending = this.ledger.loadPending().filter(isDiagnoseSession)
    if (pending.length === 0) {
      return { processed: 0, remaining: 0, sessionIds: [], traceIds: [] }
    }

    const batch = pending.slice(0, batchSize)
    const reservedTraceIds = new Set(this.ledger.loadAll().map(record => record.traceId))
    const sessionIds: string[] = []
    const traceIds: string[] = []
    const completedStatuses: Record<string, 'completed'> = Object.create(null)
    let processed = 0

    for (const session of batch) {
      const recordedDate = session.timestamp?.slice(0, 10)
      const date = recordedDate && /^\d{4}-\d{2}-\d{2}$/.test(recordedDate)
        ? recordedDate
        : new Date().toISOString().slice(0, 10)
      const settings = this.resolveDiagnoseSettings(session.runner)

      try {
        let traceId = session.traceId
        if (!traceId) {
          let offset = 0
          do {
            traceId = this.idGenerator.generate(date, offset++)
          } while (reservedTraceIds.has(traceId))
          reservedTraceIds.add(traceId)
          this.ledger.append({ ...session, traceId })
        }
        const output = await this.agentAdapter.invoke(session, traceId, settings)
        if (output.success === false) {
          throw new Error(`Runner failed to record trace ${traceId}`)
        }
        completedStatuses[session.sessionId] = 'completed'
        sessionIds.push(session.sessionId)
        traceIds.push(traceId)
        processed++
      } catch (err) {
        // Leave session as pending on failure so it can retry next time
        console.error(`[DiagnoseService] Error diagnosing session ${session.sessionId}:`, err)
      }
    }

    if (processed > 0) {
      if (this.ledger.rewriteBatchStatuses) {
        this.ledger.rewriteBatchStatuses(completedStatuses)
      } else {
        for (const sid of Object.keys(completedStatuses)) {
          this.ledger.rewriteStatus(sid, 'completed')
        }
      }
    }

    const remaining = this.ledger.loadPending().filter(isDiagnoseSession).length
    return { processed, remaining, sessionIds, traceIds }
  }

  async processAllPendingInBatches(
    batchSize = 3,
    onProgress?: (batchResult: BatchResult) => boolean | void
  ): Promise<BatchResult> {
    let totalProcessed = 0
    let lastRemaining = 0
    let lastProcessedSessionId: string | undefined
    const allSessionIds: string[] = []
    const allTraceIds: string[] = []

    while (true) {
      const result = await this.processNextBatch(batchSize)
      if (result.processed === 0) {
        lastRemaining = result.remaining
        break
      }

      totalProcessed += result.processed
      lastRemaining = result.remaining
      lastProcessedSessionId = result.sessionIds?.[0]
      if (result.sessionIds) allSessionIds.push(...result.sessionIds)
      if (result.traceIds) allTraceIds.push(...result.traceIds)

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

    const completed = this.ledger.loadAll().filter(session => session.status === 'completed' && isDiagnoseSession(session))
    const dreaming = await this.processDreaming(completed)
    const proposalSession = lastProcessedSessionId
      ? completed.find(session => session.sessionId === lastProcessedSessionId)
      : lastRemaining === 0 ? completed.at(-1) : undefined
    const proposal = proposalSession ? await this.proposeCandidate(proposalSession, completed) : { candidateCreated: null }

    const report: DiagnoseReportData = {
      processedSessions: totalProcessed,
      remainingSessions: lastRemaining,
      sessionIds: allSessionIds,
      traceIds: allTraceIds,
      ...proposal,
      agent: this.cliSettings?.agent,
      model: this.cliSettings?.model,
      effort: this.cliSettings?.effort,
    }

    return {
      processed: totalProcessed,
      remaining: lastRemaining,
      sessionIds: allSessionIds,
      traceIds: allTraceIds,
      candidateCreated: proposal.candidateCreated,
      report,
      ...(dreaming ? { dreaming } : {}),
    }
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
    const sessionId = context.sessionId ?? `capture-${randomUUID()}`

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
  ): Promise<BatchResult> {
    await this.captureSession(orchestrator, context)
    const batchResult = await this.processNextBatch(1)
    const completed = this.ledger.loadAll().filter(session => session.status === 'completed' && isDiagnoseSession(session))
    const processed = completed.find(session => session.sessionId === batchResult.sessionIds?.[0])
    const proposal = processed ? await this.proposeCandidate(processed, completed) : { candidateCreated: null }

    const report: DiagnoseReportData = {
      processedSessions: batchResult.processed,
      remainingSessions: batchResult.remaining,
      sessionIds: batchResult.sessionIds ?? [],
      traceIds: batchResult.traceIds,
      ...proposal,
    }

    return {
      ...batchResult,
      candidateCreated: proposal.candidateCreated,
      report,
    }
  }
}
