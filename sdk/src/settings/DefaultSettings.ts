import type { HarnessSettingsMap } from './SettingsSchema'

/** Default per-invocation timeout (ms) used when neither config nor harness.config.json define one. */
export const DEFAULT_PHASE_TIMEOUT_MS = 1_800_000 // 30 minutes
export const DEFAULT_WAIT_TIMEOUT_MS = 60_000 // 60 seconds

export const DEFAULT_SETTINGS: HarnessSettingsMap = {
  'claude': {
    timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
    phases: {
      bootstrap: { model: 'claude-sonnet-4-6', effort: 'low' },
      phase_a: { model: 'claude-sonnet-4-6', effort: 'high' },
      phase_b: { model: 'claude-sonnet-4-6', effort: 'medium' },
      phase_c_tl: { model: 'claude-sonnet-4-6', effort: 'low' },
      phase_c_adv: { model: 'claude-sonnet-4-6', effort: 'low' },
      phase_e: { model: 'claude-sonnet-4-6', effort: 'low' },
    }
  },
  'antigravity': {
    timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
    phases: {
      bootstrap: { model: 'Gemini 3.5 Flash (Low)' },
      phase_a: { model: 'Gemini 3.5 Flash (High)' },
      phase_b: { model: 'Gemini 3.5 Flash (Medium)' },
      phase_c_tl: { model: 'Gemini 3.5 Flash (Low)' },
      phase_c_adv: { model: 'Gemini 3.5 Flash (Low)' },
      phase_e: { model: 'Gemini 3.5 Flash (Low)' },
    }
  },
  'copilot': {
    timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
    phases: {
      bootstrap: { model: 'gpt-5.3-codex', effort: 'low' },
      phase_a: { model: 'claude-sonnet-4-6', effort: 'high' },
      phase_b: { model: 'gpt-5.3-codex', effort: 'medium' },
      phase_c_tl: { model: 'gpt-5.3-codex', effort: 'low' },
      phase_c_adv: { model: 'gpt-5.3-codex', effort: 'low' },
      phase_e: { model: 'gpt-5.3-codex', effort: 'low' },
    }
  },
  'cursor': {
    timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
    phases: {
      bootstrap: { model: 'gpt-5.3-codex', effort: 'low' },
      phase_a: { model: 'claude-sonnet-4-6', effort: 'high' },
      phase_b: { model: 'gpt-5.3-codex', effort: 'medium' },
      phase_c_tl: { model: 'gpt-5.3-codex', effort: 'low' },
      phase_c_adv: { model: 'gpt-5.3-codex', effort: 'low' },
      phase_e: { model: 'gpt-5.3-codex', effort: 'low' },
    }
  }
}
