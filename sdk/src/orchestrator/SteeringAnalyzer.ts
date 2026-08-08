import type { IAgentRunner } from '../agent-runner/IAgentRunner'
import { JsonExtractionProtocol } from '../json-extraction/JsonExtractionProtocol'
import { isExtractionResult } from '../json-extraction/types'

export type SteeringAction =
  | { type: 'add_rule'; rule: string }
  | { type: 'rollback'; targetPhase: string }
  | { type: 'override_score'; tl?: number; adv?: number }

export class SteeringAnalyzer {
  static readonly VALID_PHASES = ['BOOTSTRAP', 'PLANNING', 'DEVELOPMENT', 'REVIEW', 'MEMORY']
  static readonly MAX_RULE_LENGTH = 5000
  static readonly SCORE_MIN = 0
  static readonly SCORE_MAX = 10

  static validateActions(actions: unknown[]): SteeringAction[] {
    const validated: SteeringAction[] = []
    for (const action of actions) {
      if (!action || typeof action !== 'object') continue
      const a = action as Record<string, unknown>
      if (a.type === 'add_rule' && typeof a.rule === 'string' && a.rule.length <= SteeringAnalyzer.MAX_RULE_LENGTH) {
        validated.push({ type: 'add_rule', rule: a.rule })
      } else if (a.type === 'rollback' && typeof a.targetPhase === 'string' && SteeringAnalyzer.VALID_PHASES.includes(a.targetPhase)) {
        validated.push({ type: 'rollback', targetPhase: a.targetPhase })
      } else if (a.type === 'override_score') {
        const tl = typeof a.tl === 'number' ? Math.max(SteeringAnalyzer.SCORE_MIN, Math.min(SteeringAnalyzer.SCORE_MAX, a.tl)) : undefined
        const adv = typeof a.adv === 'number' ? Math.max(SteeringAnalyzer.SCORE_MIN, Math.min(SteeringAnalyzer.SCORE_MAX, a.adv)) : undefined
        validated.push({ type: 'override_score', tl, adv })
      }
    }
    return validated
  }

  static async analyze(msg: string, runner: IAgentRunner): Promise<SteeringAction[]> {
    const prompt = [
      `You are the harness-kit session steering analyzer.`,
      `Translate the following developer message into a JSON array of structured SteeringActions.`,
      ``,
      `Developer message: "${msg}"`,
      ``,
      `SteeringAction JSON schema:`,
      `[`,
      `  { "type": "add_rule", "rule": "string" },`,
      `  { "type": "rollback", "targetPhase": "BOOTSTRAP" | "PLANNING" | "DEVELOPMENT" | "REVIEW" | "MEMORY" },`,
      `  { "type": "override_score", "tl": number, "adv": number }`,
      `]`,
      ``,
      `Rules:`,
      `- If the user wants to add constraints, logic, rules, or instructions, return a list containing an "add_rule" action.`,
      `- If the user wants to go back, rollback, restart, or retry a previous phase, return a list containing a "rollback" action with the correct phase name.`,
      `- If the user wants to override, force, or set validation/QA scores, return a list containing an "override_score" action.`,
      `- Return ONLY raw JSON array inside a markdown block.`,
    ].join('\n')

    const output = await runner.run({
      agent: 'harness-kit:software-architect',
      mode: 'autonomous',
      payload: {},
      prompt,
    })

    const parsed = JsonExtractionProtocol.extract(output.raw)
    if (isExtractionResult(parsed) && Array.isArray(parsed.data)) {
      return SteeringAnalyzer.validateActions(parsed.data)
    }
    return []
  }
}
