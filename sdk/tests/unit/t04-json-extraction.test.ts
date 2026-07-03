import { describe, it, expect } from 'vitest'
import { JsonExtractionProtocol } from '../../src/json-extraction/JsonExtractionProtocol'
import { isExtractionError, isExtractionResult } from '../../src/json-extraction/types'

describe('T04 — JsonExtractionProtocol', () => {
  describe('TS-U-27: Extract JSON from Markdown fences', () => {
    it('extracts object from ```json fence', () => {
      const raw = '```json\n{"score": 0.85}\n```'
      const result = JsonExtractionProtocol.extract(raw)
      expect(isExtractionResult(result)).toBe(true)
      if (isExtractionResult(result)) {
        expect((result.data as Record<string, number>).score).toBe(0.85)
      }
    })

    it('extracts from generic ``` fence', () => {
      const raw = '```\n{"score": 0.72}\n```'
      const result = JsonExtractionProtocol.extract(raw)
      expect(isExtractionResult(result)).toBe(true)
      if (isExtractionResult(result)) {
        expect((result.data as Record<string, number>).score).toBe(0.72)
      }
    })
  })

  describe('TS-U-28: Extract JSON from bare object (no fences)', () => {
    it('extracts from raw string with surrounding text', () => {
      const raw = 'Some text before { "score": 0.72 } some text after'
      const result = JsonExtractionProtocol.extract(raw)
      expect(isExtractionResult(result)).toBe(true)
      if (isExtractionResult(result)) {
        expect((result.data as Record<string, number>).score).toBe(0.72)
      }
    })
  })

  describe('TS-U-29: Return ExtractionError on unparseable content', () => {
    it('returns ExtractionError for content with no JSON', () => {
      const raw = 'no json here at all just plain text'
      const result = JsonExtractionProtocol.extract(raw)
      expect(isExtractionError(result)).toBe(true)
    })
  })

  describe('TS-U-30: Return ExtractionError on syntactically invalid JSON', () => {
    it('returns ExtractionError for unquoted key in fence', () => {
      const raw = '```json\n{ score: 0.85 }\n```'
      const result = JsonExtractionProtocol.extract(raw)
      expect(isExtractionError(result)).toBe(true)
    })
  })

  describe('TS-U-31: Multiple fences — first fence wins', () => {
    it('returns data from first JSON fence', () => {
      const raw = '```json\n{"score": 0.80}\n```\n\nSome text\n\n```json\n{"score": 0.50}\n```'
      const result = JsonExtractionProtocol.extract(raw)
      expect(isExtractionResult(result)).toBe(true)
      if (isExtractionResult(result)) {
        expect((result.data as Record<string, number>).score).toBe(0.80)
      }
    })
  })

  describe('TS-U-32: Extraction never throws', () => {
    it('empty string returns ExtractionError without throwing', () => {
      expect(() => JsonExtractionProtocol.extract('')).not.toThrow()
      const result = JsonExtractionProtocol.extract('')
      expect(isExtractionError(result)).toBe(true)
    })

    it('deeply nested invalid JSON returns ExtractionError', () => {
      const raw = '{ "a": { "b": { "c": undefined } } }'
      expect(() => JsonExtractionProtocol.extract(raw)).not.toThrow()
      const result = JsonExtractionProtocol.extract(raw)
      expect(isExtractionError(result)).toBe(true)
    })

    it('nested valid JSON extracted correctly', () => {
      const raw = '{"outer": {"inner": 42}}'
      const result = JsonExtractionProtocol.extract(raw)
      expect(isExtractionResult(result)).toBe(true)
    })
  })
})
