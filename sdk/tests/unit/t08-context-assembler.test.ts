import { describe, it, expect } from 'vitest'
import { ContextAssembler } from '../../src/context-assembler/ContextAssembler'
import type { Feature, Task } from '../../src/file-state/types'

const feature: Feature = {
  id: 'F001',
  title: 'SDK Core',
  domain: 'sdk_core',
  priority: 1,
  dependencies: [],
  reworks: 0,
  scoreTL: null,
  scoreAdv: null,
  status: 'NOT_STARTED',
}

const tasks: Task[] = [
  { featureId: 'F001', taskId: 'T01', project: 'sdk', description: 'init scaffold', domain: 'sdk_core', currentPhase: '-', status: 'NOT_STARTED' },
  { featureId: 'F001', taskId: 'T02', project: 'sdk', description: 'define types', domain: 'sdk_core', currentPhase: '-', status: 'NOT_STARTED' },
]

describe('T08 — ContextAssembler', () => {
  describe('TS-U-33: Phase A payload contains only required fields', () => {
    it('payload has scope, domain, projectPaths and nothing else', () => {
      const payload = ContextAssembler.buildPhaseAPayload(feature, ['/path/to/project'])
      expect(payload).toHaveProperty('scope')
      expect(payload).toHaveProperty('domain')
      expect(payload).toHaveProperty('projectPaths')
      expect(payload).not.toHaveProperty('scoreTL')
      expect(payload).not.toHaveProperty('scoreAdv')
      expect(payload).not.toHaveProperty('tasks')
      expect(payload).not.toHaveProperty('reworks')
      // exactly 3 keys
      expect(Object.keys(payload)).toHaveLength(3)
    })

    it('scope comes from feature.title, domain from feature.domain', () => {
      const payload = ContextAssembler.buildPhaseAPayload(feature, ['/path/to/project'])
      expect(payload.scope).toBe('SDK Core')
      expect(payload.domain).toBe('sdk_core')
      expect(payload.projectPaths).toEqual(['/path/to/project'])
    })
  })

  describe('TS-U-34: Phase B payload includes retry flag and reworkLogPath when isRetry=true', () => {
    it('payload has isRetry=true and reworkLogPath', () => {
      const retryFeature = { ...feature, reworks: 1 }
      const payload = ContextAssembler.buildPhaseBPayload(retryFeature, tasks, ['/path'], true)
      expect(payload.isRetry).toBe(true)
      expect(payload.featureTitle).toBe('SDK Core')
      expect(payload).toHaveProperty('reworkLogPath')
      expect((payload.reworkLogPath as string)).toContain('sdk_core')
      expect((payload.reworkLogPath as string)).toContain('REWORK-LOG.md')
    })
  })

  describe('TS-U-35: Phase B payload excludes reworkLogPath when isRetry=false', () => {
    it('reworkLogPath absent when not a retry', () => {
      const payload = ContextAssembler.buildPhaseBPayload(feature, tasks, ['/path'], false)
      expect(payload.isRetry).toBe(false)
      expect(payload).not.toHaveProperty('reworkLogPath')
    })
  })

  describe('TS-U-36: Phase C payload contains featureId, domain, projectPaths only', () => {
    it('payload has exactly featureId, domain, projectPaths', () => {
      const payload = ContextAssembler.buildPhaseCPayload(feature, ['/path/to/project'])
      expect(payload).toHaveProperty('featureId')
      expect(payload).toHaveProperty('domain')
      expect(payload).toHaveProperty('projectPaths')
      expect(payload).not.toHaveProperty('tasks')
      expect(payload).not.toHaveProperty('scoreTL')
      expect(Object.keys(payload)).toHaveLength(3)
    })

    it('featureId is feature.id', () => {
      const payload = ContextAssembler.buildPhaseCPayload(feature, ['/path'])
      expect(payload.featureId).toBe('F001')
    })
  })

  describe('TS-U-37: Phase E payload contains domain, scopeDescription, completedCycles, recentDecisions', () => {
    it('payload has all required fields', () => {
      const decisions = ['decision 1', 'decision 2']
      const payload = ContextAssembler.buildPhaseEPayload(feature, 3, decisions)
      expect(payload).toHaveProperty('domain')
      expect(payload).toHaveProperty('scopeDescription')
      expect(payload).toHaveProperty('completedCycles')
      expect(payload).toHaveProperty('recentDecisions')
      expect(payload.domain).toBe('sdk_core')
      expect(payload.completedCycles).toBe(3)
      expect(payload.recentDecisions).toEqual(decisions)
    })
  })

  describe('Phase B payload contains tasks array', () => {
    it('payload tasks maps to taskId and description only', () => {
      const payload = ContextAssembler.buildPhaseBPayload(feature, tasks, ['/path'], false)
      expect(payload).toHaveProperty('tasks')
      const payloadTasks = payload.tasks as Array<{ taskId: string; description: string }>
      expect(payloadTasks).toHaveLength(2)
      expect(payloadTasks[0]).toHaveProperty('taskId')
      expect(payloadTasks[0]).toHaveProperty('description')
    })
  })
})
