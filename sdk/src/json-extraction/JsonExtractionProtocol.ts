import type { ExtractionOutcome, ExtractionResult, ExtractionError } from './types'

const FENCE_REGEX = /```(?:json)?\s*([\s\S]*?)\s*```/g

export class JsonExtractionProtocol {
  /**
   * 4-step extraction:
   * 1. Search for Markdown fences containing JSON
   * 2. If none found: extract substring from first '{' to last '}'
   * 3. Parse as JSON
   * 4. If parse fails: return ExtractionError (never throw)
   */
  static extract(raw: string): ExtractionOutcome {
    try {
      // Strip ANSI escape codes
      const cleanRaw = raw.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')

      // Step 1: search for Markdown fences and try parsing each
      FENCE_REGEX.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = FENCE_REGEX.exec(cleanRaw)) !== null) {
        const candidate = match[1].trim()
        const parsed = JsonExtractionProtocol.tryParse(candidate, raw)
        if ('data' in parsed) {
          return parsed
        }
      }

      // Step 2: fallback — first '{' or '[' to last matching '}' or ']'
      const firstBrace = cleanRaw.indexOf('{')
      const firstBracket = cleanRaw.indexOf('[')
      const firstPos = firstBrace === -1 ? firstBracket
        : firstBracket === -1 ? firstBrace
        : Math.min(firstBrace, firstBracket)
      const isArray = firstPos === firstBracket && (firstBrace === -1 || firstBracket < firstBrace)
      const lastPos = isArray ? cleanRaw.lastIndexOf(']') : cleanRaw.lastIndexOf('}')
      if (firstPos === -1 || lastPos === -1 || lastPos <= firstPos) {
        return { error: 'No JSON-like content found', raw } as ExtractionError
      }
      const candidate = cleanRaw.substring(firstPos, lastPos + 1)
      return JsonExtractionProtocol.tryParse(candidate, raw)
    } catch {
      return { error: 'Unexpected error during extraction', raw } as ExtractionError
    }
  }

  private static tryParse(candidate: string, raw: string): ExtractionOutcome {
    try {
      const data = JSON.parse(candidate)
      return { data } as ExtractionResult
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { error: `JSON parse failed: ${msg}`, raw } as ExtractionError
    }
  }
}
