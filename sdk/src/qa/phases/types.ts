import type { AgentSession } from '../../agent-runner/types'
import type { IAgentRunner } from '../../agent-runner/IAgentRunner'
import type { QaAgenticRequest, QaFinalReport, QaPlan, QaRun } from '../types'
import type { QaRunStore } from '../services/QaRunStore'
import type { QaService } from '../services/QaService'
import type { HarnessSettings } from '../../settings/HarnessSettings'
import type { PhaseSettings } from '../../settings/SettingsSchema'
import { DEFAULT_SETTINGS } from '../../settings/DefaultSettings'
import type { QaProgressListener } from '../progress'

export enum QaPhase {
  PLANNING = 'PLANNING',
  VALIDATION = 'VALIDATION',
  EXECUTION = 'EXECUTION',
  ANALYSIS = 'ANALYSIS',
  REPORTING = 'REPORTING',
  COMPLETED = 'COMPLETED',
}

export interface QaPhaseContext {
  workspace: string
  request: QaAgenticRequest
  runner: IAgentRunner
  store: QaRunStore
  service: QaService
  settings?: HarnessSettings
  model?: string
  effort?: string
  onProgress?: QaProgressListener
  session?: AgentSession
  plan?: QaPlan
  persistPlan?: boolean
  run?: QaRun
  report?: QaFinalReport
  analysisCycles?: number
}

export interface QaPhaseHandler {
  readonly phase: QaPhase
  execute(context: QaPhaseContext, signal?: AbortSignal): Promise<QaPhase>
}

export function resolveQaPhaseSettings(context: QaPhaseContext, phaseKey: string): PhaseSettings {
  const runnerType = context.runner.type ?? ''
  const settingsKey = context.settings?.hasSettings(runnerType) ? runnerType : runnerType.split('-')[0]
  const configured = settingsKey ? context.settings?.resolve(settingsKey, phaseKey) ?? {} : {}
  const defaultKey = DEFAULT_SETTINGS[runnerType] ? runnerType : runnerType.split('-')[0]
  const defaults = DEFAULT_SETTINGS[defaultKey]?.phases?.[phaseKey] ?? {}
  return {
    model: context.model ?? configured.model ?? defaults.model,
    effort: context.effort ?? configured.effort ?? defaults.effort,
    timeoutMs: configured.timeoutMs ?? defaults.timeoutMs,
  }
}
