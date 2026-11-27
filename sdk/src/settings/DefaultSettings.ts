
import type { HarnessSettingsMap } from "./SettingsSchema";

/** Default per-invocation timeout (ms). */
export const DEFAULT_PHASE_TIMEOUT_MS = 3_600_000; // 60 minutes
export const DEFAULT_WAIT_TIMEOUT_MS = 60_000; // 60 seconds

/**
 * Model catalogs checked on 2026-11-27:
 * https://platform.claude.com/docs/en/models/overview
 * https://antigravity.google/docs/models
 * https://developers.openai.com/api/docs/models
 * https://docs.github.com/en/copilot/reference/ai-models/supported-models
 * https://cursor.com/docs/models-and-pricing
 *
 * Model allocation strategy:
 * - Low-cost models for operational and implementation tasks.
 * - Balanced models for planning, review and critical analysis.
 * - Reasoning effort proportional to phase complexity.
 * - Premium models excluded from default settings.
 */
export const DEFAULT_SETTINGS: HarnessSettingsMap = {
  claude: {
    timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
    phases: {
      bootstrap: { model: "claude-sonnet-5-5", effort: "medium" },
      planning: { model: "claude-sonnet-5-5", effort: "high" },
      refinement_questions: { model: "claude-haiku-5-5", effort: "high" },
      refinement_consolidation: { model: "claude-sonnet-5-5", effort: "high" },
      implementation: { model: "claude-haiku-5-5", effort: "high" },
      review_tl: { model: "claude-haiku-5-5", effort: "high" },
      review_adv: { model: "claude-sonnet-5-5", effort: "medium" },
      memory: { model: "claude-haiku-5-5", effort: "high" },
      deploy_message: { model: "claude-haiku-5-5", effort: "high" },
      diagnose: { model: "claude-sonnet-5-5", effort: "medium" },
      qa_planning: { model: "claude-haiku-5-5", effort: "high" },
      qa_analysis: { model: "claude-sonnet-5-5", effort: "medium" },
      qa_reporting: { model: "claude-haiku-5-5", effort: "high" },
    },
  },
  antigravity: {
    timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
    phases: {
      bootstrap: { model: "gemini-4-neon", effort: "medium" },
      planning: { model: "gemini-4-neon", effort: "high" },
      refinement_questions: { model: "gemini-4-hydrogen", effort: "medium" },
      refinement_consolidation: { model: "gemini-4-hydrogen", effort: "high" },
      implementation: { model: "gemini-4-hydrogen", effort: "high" },
      review_tl: { model: "gemini-4-neon", effort: "medium" },
      review_adv: { model: "gemini-4-neon", effort: "high" },
      memory: { model: "gemini-4-hydrogen", effort: "medium" },
      deploy_message: { model: "gemini-4-hydrogen", effort: "low" },
      diagnose: { model: "gemini-4-neon", effort: "medium" },
      qa_planning: { model: "gemini-4-hydrogen", effort: "high" },
      qa_analysis: { model: "gemini-4-neon", effort: "medium" },
      qa_reporting: { model: "gemini-4-hydrogen", effort: "low" },
    },
  },
  copilot: {
    timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
    phases: {
      bootstrap: { model: "gpt-6.1-terra", effort: "medium" },
      planning: { model: "gpt-6.1-terra", effort: "high" },
      refinement_questions: { model: "gpt-6.1-terra", effort: "high" },
      refinement_consolidation: { model: "gpt-6.1-terra", effort: "medium" },
      implementation: { model: "gpt-6.1-terra", effort: "high" },
      review_tl: { model: "gpt-6.2-sol", effort: "medium" },
      review_adv: { model: "gpt-6.2-sol", effort: "medium" },
      memory: { model: "gpt-6-luna", effort: "xhigh" },
      deploy_message: { model: "gpt-6-luna", effort: "high" },
      diagnose: { model: "gpt-6.2-sol", effort: "medium" },
      qa_planning: { model: "gpt-6.1-terra", effort: "high" },
      qa_analysis: { model: "gpt-6.1-terra", effort: "high" },
      qa_reporting: { model: "gpt-6-luna", effort: "high" },
    },
  },
  cursor: {
    timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
    phases: {
      bootstrap: { model: "claude-sonnet-5-5", effort: "medium" },
      planning: { model: "claude-sonnet-5-5", effort: "high" },
      refinement_questions: { model: "claude-haiku-5-5", effort: "high" },
      refinement_consolidation: { model: "claude-sonnet-5-5", effort: "high" },
      implementation: { model: "claude-haiku-5-5", effort: "high" },
      review_tl: { model: "claude-haiku-5-5", effort: "high" },
      review_adv: { model: "claude-sonnet-5-5", effort: "medium" },
      memory: { model: "claude-haiku-5-5", effort: "high" },
      deploy_message: { model: "claude-haiku-5-5", effort: "high" },
      diagnose: { model: "claude-sonnet-5-5", effort: "medium" },
      qa_planning: { model: "claude-haiku-5-5", effort: "high" },
      qa_analysis: { model: "claude-sonnet-5-5", effort: "medium" },
      qa_reporting: { model: "claude-haiku-5-5", effort: "high" },
    },
  },
  codex: {
    timeoutMs: DEFAULT_PHASE_TIMEOUT_MS,
    phases: {
      bootstrap: { model: "gpt-6.1-terra", effort: "medium" },
      planning: { model: "gpt-6.1-terra", effort: "high" },
      refinement_questions: { model: "gpt-6.1-terra", effort: "high" },
      refinement_consolidation: { model: "gpt-6.1-terra", effort: "medium" },
      implementation: { model: "gpt-6.1-terra", effort: "high" },
      review_tl: { model: "gpt-6.2-sol", effort: "medium" },
      review_adv: { model: "gpt-6.2-sol", effort: "medium" },
      memory: { model: "gpt-6-luna", effort: "xhigh" },
      deploy_message: { model: "gpt-6-luna", effort: "high" },
      diagnose: { model: "gpt-6.2-sol", effort: "medium" },
      qa_planning: { model: "gpt-6.1-terra", effort: "high" },
      qa_analysis: { model: "gpt-6.1-terra", effort: "high" },
      qa_reporting: { model: "gpt-6-luna", effort: "high" },
    },
  },
};
