import type { HarnessSettingsMap } from './SettingsSchema'

/** Default per-invocation timeout (ms) used when neither config nor harness.config.json define one. */
export const DEFAULT_PHASE_TIMEOUT_MS = 1_800_000 // 30 minutes

export const DEFAULT_SETTINGS: HarnessSettingsMap = {
  'claude-code': {
    phases: {
      bootstrap: { model: 'claude-sonnet-4-6', effort: 'low' },
      phase_a: { model: 'claude-sonnet-4-6', effort: 'high' },
      phase_b: { model: 'claude-sonnet-4-6', effort: 'medium' },
      phase_c_tl: { model: 'claude-sonnet-4-6', effort: 'low' },
      phase_c_adv: { model: 'claude-sonnet-4-6', effort: 'low' },
      phase_e: { model: 'claude-sonnet-4-6', effort: 'low' },
    }
  },
  'claude-agent': {
    phases: {
      bootstrap: { model: 'claude-sonnet-4-6' },
      phase_a: { model: 'claude-sonnet-4-6' },
      phase_b: { model: 'claude-sonnet-4-6' },
      phase_c_tl: { model: 'claude-sonnet-4-6' },
      phase_c_adv: { model: 'claude-sonnet-4-6' },
      phase_e: { model: 'claude-sonnet-4-6' },
    }
  },
  'antigravity': {
    phases: {
      bootstrap: { model: 'gemini-3.5-flash' },
      phase_a: { model: 'gemini-3.5-flash' },
      phase_b: { model: 'gemini-3.5-flash' },
      phase_c_tl: { model: 'gemini-3.5-flash' },
      phase_c_adv: { model: 'gemini-3.5-flash' },
      phase_e: { model: 'gemini-3.5-flash' },
    }
  },
  'copilot': {
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
    phases: {
      bootstrap: { model: 'gpt-5.3-codex', effort: 'low' },
      phase_a: { model: 'claude-sonnet-4-6', effort: 'high' },
      phase_b: { model: 'gpt-5.3-codex', effort: 'medium' },
      phase_c_tl: { model: 'gpt-5.3-codex', effort: 'low' },
      phase_c_adv: { model: 'gpt-5.3-codex', effort: 'low' },
      phase_e: { model: 'gpt-5.3-codex', effort: 'low' },
    }
  },
  'opencode': {
    phases: {
      bootstrap: { model: 'opencode/model' },
      phase_a: { model: 'opencode/model' },
      phase_b: { model: 'opencode/model' },
      phase_c_tl: { model: 'opencode/model' },
      phase_c_adv: { model: 'opencode/model' },
      phase_e: { model: 'opencode/model' },
    }
  }
}
