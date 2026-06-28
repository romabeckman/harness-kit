export interface PhaseSettings {
  model?: string
  effort?: string
}

export interface RunnerSettings {
  phases?: Record<string, PhaseSettings>
}

export type HarnessSettingsMap = Record<string, RunnerSettings>
