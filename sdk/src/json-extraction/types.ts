export interface ExtractionResult {
  data: unknown
}

export interface ExtractionError {
  error: string
  raw: string
}

export type ExtractionOutcome = ExtractionResult | ExtractionError

export function isExtractionError(outcome: ExtractionOutcome): outcome is ExtractionError {
  return 'error' in outcome
}

export function isExtractionResult(outcome: ExtractionOutcome): outcome is ExtractionResult {
  return 'data' in outcome
}
