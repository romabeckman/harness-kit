import type { IAgentRunner } from '../agent-runner/IAgentRunner'
import { JsonExtractionProtocol } from '../json-extraction/JsonExtractionProtocol'
import { isExtractionResult } from '../json-extraction/types'

export type SteeringAction =
  | { type: 'add_rule'; rule: string }
  | { type: 'rollback'; targetPhase: string }
  | { type: 'override_score'; tl?: number; adv?: number }

export class SteeringAnalyzer {
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
      return parsed.data as SteeringAction[]
    }
    return []
  }
}
