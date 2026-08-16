import type { HarnessSettingsMap } from './SettingsSchema'

/** Default per-invocation timeout (ms) used when neither config nor harness.config.json define one. */
export const DEFAULT_PHASE_TIMEOUT_MS = 1_800_000 // 30 minutes
export const DEFAULT_WAIT_TIMEOUT_MS = 60_000 // 60 seconds

export const DEFAULT_SETTINGS: HarnessSettingsMap = {
  'claude': {
    timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
    phases: {
      bootstrap: { model: 'anthropic.claude-5-sonnet', effort: 'medium' },
      planning: { model: 'anthropic.claude-5-sonnet', effort: 'high' },
      implementation: { model: 'anthropic.claude-5-sonnet', effort: 'medium' },
      review_tl: { model: 'anthropic.claude-5-sonnet', effort: 'low' },
      review_adv: { model: 'anthropic.claude-5-sonnet', effort: 'low' },
      memory: { model: 'anthropic.claude-5-sonnet', effort: 'low' },
      diagnose: { model: 'anthropic.claude-5-sonnet', effort: 'low' },
    }
  },
  'antigravity': {
    timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
    phases: {
      bootstrap: { model: 'gemini-3.7-flash', effort: 'medium' },
      planning: { model: 'gemini-3.7-flash', effort: 'high' },
      implementation: { model: 'gemini-3.7-flash', effort: 'medium' },
      review_tl: { model: 'gemini-3.7-flash', effort: 'low' },
      review_adv: { model: 'gemini-3.7-flash', effort: 'low' },
      memory: { model: 'gemini-3.7-flash', effort: 'low' },
      diagnose: { model: 'gemini-3.7-flash', effort: 'low' },
    }
  },
  'copilot': {
    timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
    phases: {
      bootstrap: { model: 'gpt-5.6-sol', effort: 'medium' },
      planning: { model: 'gpt-5.6-sol', effort: 'high' },
      implementation: { model: 'gpt-5.6-luna', effort: 'xhigh' },
      review_tl: { model: 'gpt-5.6-luna', effort: 'xhigh' },
      review_adv: { model: 'gpt-5.6-luna', effort: 'xhigh' },
      memory: { model: 'gpt-5.6-luna', effort: 'xhigh' },
      diagnose: { model: 'gpt-5.6-luna', effort: 'xhigh' },
    }
  },
  'cursor': {
    timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
    phases: {
      bootstrap: { model: 'gpt-5.6-sol', effort: 'medium' },
      planning: { model: 'gpt-5.6-sol', effort: 'high' },
      implementation: { model: 'gpt-5.6-sol', effort: 'medium' },
      review_tl: { model: 'gpt-5.6-luna', effort: 'xhigh' },
      review_adv: { model: 'gpt-5.6-luna', effort: 'xhigh' },
      memory: { model: 'gpt-5.6-sol', effort: 'low' },
      diagnose: { model: 'gpt-5.6-luna', effort: 'xhigh' },
    }
  },
  'codex': {
    timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
    phases: {
      bootstrap: { model: 'gpt-5.6-sol', effort: 'medium' },
      planning: { model: 'gpt-5.6-sol', effort: 'high' },
      implementation: { model: 'gpt-5.6-luna', effort: 'xhigh' },
      review_tl: { model: 'gpt-5.6-luna', effort: 'xhigh' },
      review_adv: { model: 'gpt-5.6-luna', effort: 'xhigh' },
      memory: { model: 'gpt-5.6-luna', effort: 'xhigh' },
      diagnose: { model: 'gpt-5.6-luna', effort: 'xhigh' },
    }
  }
}
