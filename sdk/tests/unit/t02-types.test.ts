import { describe, it, expect } from 'vitest'

// TS-U-01: FeatureStatus exhaustiveness
// TS-U-02: Feature with null scores
// TS-U-03: Feature with populated scores
// TS-U-04: Task default phase value
// TS-U-05: BootstrapConfig default thresholds
// TS-U-06: OrchestratorConfig.agentRunner is optional (compile-time — verified via tsc)

import type { FeatureStatus, Feature, Task, BootstrapConfig } from '../../src/file-state/types'
import type { AgentOutput, AgentInvocation, TokenUsage } from '../../src/agent-runner/types'
import type { ExtractionResult, ExtractionError } from '../../src/json-extraction/types'
import { Phase } from '../../src/orchestrator/types'
import { Verdict } from '../../src/validation-gate/types'

describe('T02 — Shared type definitions', () => {
  describe('TS-U-01: FeatureStatus exhaustiveness', () => {
    it('all five FeatureStatus values are valid', () => {
      const statuses: FeatureStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'FAILED']
      expect(statuses).toHaveLength(5)
    })
  })

  describe('TS-U-02: Feature with null scores', () => {
    it('Feature accepts null scoreTL and scoreAdv', () => {
      const f: Feature = {
        id: 'F001',
        title: 'test',
        domain: 'sdk_core',
        priority: 1,
        dependencies: [],
        reworks: 0,
        scoreTL: null,
        scoreAdv: null,
        status: 'NOT_STARTED',
      }
      expect(f.scoreTL).toBeNull()
      expect(f.scoreAdv).toBeNull()
    })
  })

  describe('TS-U-03: Feature with populated scores', () => {
    it('Feature stores exact score values', () => {
      const f: Feature = {
        id: 'F001',
        title: 'test',
        domain: 'sdk_core',
        priority: 1,
        dependencies: [],
        reworks: 0,
        scoreTL: 0.85,
        scoreAdv: 0.72,
        status: 'IN_PROGRESS',
      }
      expect(f.scoreTL).toBe(0.85)
      expect(f.scoreAdv).toBe(0.72)
    })
  })

  describe('TS-U-04: Task default phase value', () => {
    it('Task accepts currentPhase "-"', () => {
      const t: Task = {
        featureId: 'F001',
        taskId: 'T01',
        project: 'sdk',
        description: 'test task',
        domain: 'sdk_core',
        currentPhase: '-',
        status: 'NOT_STARTED',
      }
      expect(t.currentPhase).toBe('-')
    })
  })

  describe('TS-U-05: BootstrapConfig thresholds', () => {
    it('BootstrapConfig stores exact numeric values without mutation', () => {
      const cfg: BootstrapConfig = {
        scoreThresholdTL: 0.70,
        scoreThresholdAdv: 0.70,
        completionCriteria: { maxReworks: 2 },
        cycleCounter: { completedCycles: 0 },
      }
      expect(cfg.scoreThresholdTL).toBe(0.70)
      expect(cfg.scoreThresholdAdv).toBe(0.70)
      expect(cfg.completionCriteria.maxReworks).toBe(2)
    })
  })

  describe('Phase enum', () => {
    it('Phase enum values are correct strings', () => {
      expect(Phase.BOOTSTRAP).toBe('BOOTSTRAP')
      expect(Phase.PLANNING).toBe('PLANNING')
      expect(Phase.DEVELOPMENT).toBe('DEVELOPMENT')
      expect(Phase.REVIEW).toBe('REVIEW')
      expect(Phase.MEMORY).toBe('MEMORY')
      expect(Phase.TRANSITION).toBe('TRANSITION')
      expect(Phase.DEPLOY).toBe('DEPLOY')
      expect(Phase.CASCADE_BLOCKED).toBe('CASCADE_BLOCKED')
      expect(Phase.HALTED).toBe('HALTED')
    })
  })

  describe('Verdict enum', () => {
    it('Verdict enum values are correct strings', () => {
      expect(Verdict.PASS).toBe('PASS')
      expect(Verdict.RETRY).toBe('RETRY')
      expect(Verdict.BLOCK).toBe('BLOCK')
      expect(Verdict.FAIL).toBe('FAIL')
    })
  })

  describe('AgentOutput type', () => {
    it('AgentOutput has raw string and optional artefacts', () => {
      const out: AgentOutput = { raw: 'some output' }
      expect(out.raw).toBe('some output')
      expect(out.artefacts).toBeUndefined()
    })

    it('AgentOutput accepts usage field', () => {
      const usage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 5,
        cacheReadTokens: 10,
        costUsd: 0.003,
      }
      const out: AgentOutput = { raw: 'output', usage }
      expect(out.usage).toBeDefined()
      expect(out.usage!.costUsd).toBe(0.003)
    })
  })

  describe('TokenUsage shape', () => {
    it('TokenUsage has all 5 required fields', () => {
      const u: TokenUsage = {
        inputTokens: 10,
        outputTokens: 5,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        costUsd: 0.001,
      }
      expect(Object.keys(u)).toHaveLength(5)
      expect(u).toHaveProperty('inputTokens')
      expect(u).toHaveProperty('outputTokens')
      expect(u).toHaveProperty('cacheCreationTokens')
      expect(u).toHaveProperty('cacheReadTokens')
      expect(u).toHaveProperty('costUsd')
    })
  })

  describe('AgentInvocation.prompt optional field', () => {
    it('AgentInvocation is valid without prompt field', () => {
      const inv: AgentInvocation = {
        skill: 'tdd-orchestrator',
        agent: 'developer-backend',
        mode: 'autonomous',
        payload: { foo: 'bar' },
      }
      expect(inv.prompt).toBeUndefined()
    })

    it('AgentInvocation accepts explicit prompt override', () => {
      const inv: AgentInvocation = {
        skill: 'tdd-orchestrator',
        agent: 'developer-backend',
        mode: 'autonomous',
        payload: {},
        prompt: 'explicit override text',
      }
      expect(inv.prompt).toBe('explicit override text')
    })
  })

  describe('ExtractionResult and ExtractionError', () => {
    it('ExtractionResult has data field', () => {
      const r: ExtractionResult = { data: { score: 0.85 } }
      expect(r.data).toEqual({ score: 0.85 })
    })

    it('ExtractionError has error field', () => {
      const e: ExtractionError = { error: 'parse failed', raw: 'bad json' }
      expect(e.error).toBe('parse failed')
    })
  })
})
