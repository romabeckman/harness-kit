import { JsonExtractionProtocol } from '../json-extraction/JsonExtractionProtocol'
import { isExtractionResult } from '../json-extraction/types'

export interface ProgressLine {
  agent: string
  skill: string
  type: 'text' | 'tool_use' | 'tool_result' | 'result'
  text?: string
  toolName?: string
  isError?: boolean
}

export function defaultProgress(line: ProgressLine): void {
  const tag = line.skill ? `[${line.skill}] ` : ' '
  if (line.type === 'text' && line.text) {
    const preview = line.text.replace(/\n/g, ' ').slice(0, 120)
    process.stderr.write(`${tag}${preview}\n`)
  } else if (line.type === 'tool_use' && line.toolName) {
    process.stderr.write(`${tag}→ ${line.toolName}\n`)
  } else if (line.type === 'result') {
    process.stderr.write(`${tag}✓ done\n`)
  }
}

export function extractJsonOrNull(raw: string): unknown | null {
  const outcome = JsonExtractionProtocol.extract(raw)
  return isExtractionResult(outcome) ? outcome.data : null
}
