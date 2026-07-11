import { describe, it, expect } from 'vitest'
import { BacklogParser } from '../../src/file-state/parsers/BacklogParser'
import { DevStateParser } from '../../src/file-state/parsers/DevStateParser'
import { BootstrapConfigParser } from '../../src/file-state/parsers/BootstrapConfigParser'

describe('T06 — FileStateManager parsers', () => {
  describe('BacklogParser', () => {
    const HEADER = '| ID | Title | Domain | Layer | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status |'
    const SEP    = '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'

    it('parses three feature rows', () => {
      const md = [
        HEADER, SEP,
        '| F001 | Feature One | sdk_core | backend | 1 | - | 0 | - | - | NOT_STARTED |',
        '| F002 | Feature Two | sdk_core | frontend | 2 | F001 | 1 | 0.85 | 0.80 | IN_PROGRESS |',
        '| F003 | Feature Three | sdk_core | backend | 3 | F001,F002 | 0 | - | - | COMPLETED |',
      ].join('\n')
      const features = BacklogParser.parse(md)
      expect(features).toHaveLength(3)
      expect(features[0].id).toBe('F001')
      expect(features[0].title).toBe('Feature One')
      expect(features[0].layer).toBe('backend')
      expect(features[0].dependencies).toEqual([])
      expect(features[0].reworks).toBe(0)
      expect(features[0].scoreTL).toBeNull()
      expect(features[0].scoreAdv).toBeNull()
      expect(features[1].layer).toBe('frontend')
      expect(features[1].dependencies).toEqual(['F001'])
      expect(features[1].reworks).toBe(1)
      expect(features[1].scoreTL).toBe(0.85)
      expect(features[1].scoreAdv).toBe(0.80)
      expect(features[2].dependencies).toEqual(['F001', 'F002'])
    })

    it('returns empty array for header-only markdown', () => {
      const md = [HEADER, SEP].join('\n')
      expect(BacklogParser.parse(md)).toEqual([])
    })

    it('handles Score columns with "-" as null (TS-I-18)', () => {
      const md = [
        HEADER, SEP,
        '| F001 | Test | sdk_core | backend | 1 | - | 0 | - | - | NOT_STARTED |',
      ].join('\n')
      const features = BacklogParser.parse(md)
      expect(features[0].scoreTL).toBeNull()
      expect(features[0].scoreAdv).toBeNull()
    })

    it('handles malformed rows without throwing', () => {
      const md = HEADER + '\n' + SEP + '\n| incomplete row |'
      expect(() => BacklogParser.parse(md)).not.toThrow()
    })
  })

  describe('DevStateParser', () => {
    const HEADER = '| Feature ID | Task ID | Project | Description | Domain | Current Phase | Status |'
    const SEP    = '| --- | --- | --- | --- | --- | --- | --- |'

    it('parses task rows correctly', () => {
      const md = [
        HEADER, SEP,
        '| F001 | T01 | sdk | Initialize scaffold | sdk_core | IMPLEMENTATION | NOT_STARTED |',
        '| F001 | T02 | sdk | Define types | sdk_core | - | IN_PROGRESS |',
      ].join('\n')
      const tasks = DevStateParser.parse(md)
      expect(tasks).toHaveLength(2)
      expect(tasks[0].featureId).toBe('F001')
      expect(tasks[0].taskId).toBe('T01')
      expect(tasks[0].currentPhase).toBe('IMPLEMENTATION')
      expect(tasks[0].status).toBe('NOT_STARTED')
      expect(tasks[1].currentPhase).toBe('-')
    })

    it('returns empty array for header-only file (TS-I-17)', () => {
      const md = [HEADER, SEP].join('\n')
      expect(DevStateParser.parse(md)).toEqual([])
    })

    it('handles malformed rows without throwing', () => {
      const md = HEADER + '\n' + SEP + '\n| partial |'
      expect(() => DevStateParser.parse(md)).not.toThrow()
    })
  })

  describe('BootstrapConfigParser', () => {
    it('parses valid BOOTSTRAP-CONFIG.json', () => {
      const json = JSON.stringify({
        scoreThresholdTL: 0.70,
      scoreThresholdAdv: 0.70,
        completionCriteria: { maxReworks: 2 },
        cycleCounter: { completedCycles: 0 },
      })
      const cfg = BootstrapConfigParser.parse(json)
      expect(cfg.scoreThresholdTL).toBe(0.70)
      expect(cfg.completionCriteria.maxReworks).toBe(2)
      expect(cfg.cycleCounter.completedCycles).toBe(0)
    })

    it('parses config with extra fields (template format with userProvided)', () => {
      const json = JSON.stringify({
        scoreThresholdTL: 0.70,
      scoreThresholdAdv: 0.70,
        completionCriteria: { maxReworks: 2, userProvided: false },
        cycleCounter: { completedCycles: 0, lastAutoTuningAt: null },
      })
      const cfg = BootstrapConfigParser.parse(json)
      expect(cfg.scoreThresholdTL).toBe(0.70)
      expect(cfg.completionCriteria.maxReworks).toBe(2)
    })

    it('throws on invalid JSON', () => {
      expect(() => BootstrapConfigParser.parse('not json')).toThrow()
    })

    it('sanitizes maxReworks: 0 to minimum 1 to prevent immediate FAIL', () => {
      const json = JSON.stringify({
        scoreThresholdTL: 0.70,
      scoreThresholdAdv: 0.70,
        completionCriteria: { maxReworks: 0 },
        cycleCounter: { completedCycles: 0 },
      })
      const cfg = BootstrapConfigParser.parse(json)
      expect(cfg.completionCriteria.maxReworks).toBe(1)
    })
  })
})
