export interface PhaseSettings {
  model?: string
  effort?: string
  timeoutMs?: number
}

export interface RunnerSettings {
  timeoutMs?: number
  phases?: Record<string, PhaseSettings>
}

export type HarnessSettingsMap = Record<string, RunnerSettings>
