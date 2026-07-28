import type { HarnessSettingsMap } from './SettingsSchema'

/** Default per-invocation timeout (ms) used when neither config nor harness.config.json define one. */
export const DEFAULT_PHASE_TIMEOUT_MS = 1_800_000 // 30 minutes
export const DEFAULT_WAIT_TIMEOUT_MS = 60_000 // 60 seconds

export const DEFAULT_SETTINGS: HarnessSettingsMap = {
  'claude': {
    timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
    phases: {
      bootstrap: { model: 'claude-5-sonnet', effort: 'medium' },
      planning: { model: 'claude-5-sonnet', effort: 'high' },
      implementation: { model: 'claude-5-sonnet', effort: 'medium' },
      review_tl: { model: 'claude-5-sonnet', effort: 'low' },
      review_adv: { model: 'claude-5-sonnet', effort: 'low' },
      memory: { model: 'claude-5-sonnet', effort: 'low' },
    }
  },
  'antigravity': {
    timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
    phases: {
      bootstrap: { model: 'gemini-3.6-flash', effort: 'high' },
      planning: { model: 'gemini-3.1-pro', effort: 'high' },
      implementation: { model: 'gemini-3.6-flash', effort: 'medium' },
      review_tl: { model: 'gemini-3.1-pro', effort: 'low' },
      review_adv: { model: 'gemini-3.1-pro', effort: 'low' },
      memory: { model: 'gemini-3.6-flash', effort: 'low' },
    }
  },
  'copilot': {
    timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
    phases: {
      bootstrap: { model: 'gpt-5.3-codex', effort: 'medium' },
      planning: { model: 'claude-5-sonnet', effort: 'high' },
      implementation: { model: 'gpt-5.3-codex', effort: 'medium' },
      review_tl: { model: 'gpt-5.3-codex', effort: 'low' },
      review_adv: { model: 'gpt-5.3-codex', effort: 'low' },
      memory: { model: 'gpt-5.3-codex', effort: 'low' },
    }
  },
  'cursor': {
    timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
    phases: {
      bootstrap: { model: 'gpt-5.3-codex', effort: 'medium' },
      planning: { model: 'claude-5-sonnet', effort: 'high' },
      implementation: { model: 'gpt-5.3-codex', effort: 'medium' },
      review_tl: { model: 'gpt-5.3-codex', effort: 'low' },
      review_adv: { model: 'gpt-5.3-codex', effort: 'low' },
      memory: { model: 'gpt-5.3-codex', effort: 'low' },
    }
  }
}
