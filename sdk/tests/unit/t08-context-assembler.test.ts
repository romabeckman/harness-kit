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
    it('payload has scope, workingDir, domain, featureTitle, projectPaths and nothing else', () => {
      const payload = ContextAssembler.buildPlanningPayload(feature, '/path/to/workdir', ['/path/to/project'])
      expect(payload).toHaveProperty('scope')
      expect(payload).toHaveProperty('workingDir')
      expect(payload).toHaveProperty('domain')
      expect(payload).toHaveProperty('featureTitle')
      expect(payload).toHaveProperty('projectPaths')
      expect(payload).not.toHaveProperty('scoreTL')
      expect(payload).not.toHaveProperty('scoreAdv')
      expect(payload).not.toHaveProperty('tasks')
      expect(payload).not.toHaveProperty('reworks')
      // exactly 5 keys
      expect(Object.keys(payload)).toHaveLength(5)
    })

    it('scope comes from feature.title when scope is not provided, domain from feature.domain', () => {
      const payload = ContextAssembler.buildPlanningPayload(feature, '/path/to/workdir', ['/path/to/project'])
      expect(payload.scope).toBe('SDK Core')
      expect(payload.domain).toBe('sdk_core')
      expect(payload.featureTitle).toBe('SDK Core')
      expect(payload.projectPaths).toEqual(['/path/to/project'])
    })

    it('scope comes from scope parameter when provided', () => {
      const payload = ContextAssembler.buildPlanningPayload(feature, '/path/to/workdir', ['/path/to/project'], 'My Scope')
      expect(payload.scope).toBe('My Scope')
      expect(payload.domain).toBe('sdk_core')
      expect(payload.featureTitle).toBe('SDK Core')
      expect(payload.projectPaths).toEqual(['/path/to/project'])
    })
  })

  describe('TS-U-34: Phase B payload includes retry flag and reworkLogPath when isRetry=true', () => {
    it('payload has isRetry=true and reworkLogPath', () => {
      const retryFeature = { ...feature, reworks: 1 }
      const payload = ContextAssembler.buildDevelopmenPayload(retryFeature, 'workdir', tasks, ['/path'], true)
      expect(payload.isRetry).toBe(true)
      expect(payload.featureTitle).toBe('SDK Core')
      expect(payload).toHaveProperty('reworkLogPath')
      expect((payload.reworkLogPath as string)).toContain('sdk_core')
      expect((payload.reworkLogPath as string)).toContain('REWORK-LOG.md')
    })
  })

  describe('TS-U-35: Phase B payload excludes reworkLogPath when isRetry=false', () => {
    it('reworkLogPath absent when not a retry', () => {
      const payload = ContextAssembler.buildDevelopmenPayload(feature, 'workdir', tasks, ['/path'], false)
      expect(payload.isRetry).toBe(false)
      expect(payload).not.toHaveProperty('reworkLogPath')
    })
  })

  describe('TS-U-36: Phase C payload contains featureId, featureTitle, domain, projectPaths', () => {
    it('payload has featureId, featureTitle, domain, projectPaths', () => {
      const payload = ContextAssembler.buildReviewPayload(feature, 'workdir', ['/path/to/project'])
      expect(payload).toHaveProperty('featureId')
      expect(payload).toHaveProperty('featureTitle')
      expect(payload).toHaveProperty('domain')
      expect(payload).toHaveProperty('projectPaths')
      expect(payload).not.toHaveProperty('tasks')
      expect(payload).not.toHaveProperty('scoreTL')
      expect(Object.keys(payload)).toHaveLength(6)
    })

    it('featureId is feature.id and featureTitle is feature.title', () => {
      const payload = ContextAssembler.buildReviewPayload(feature, 'workdir', ['/path'])
      expect(payload.featureId).toBe('F001')
      expect(payload.featureTitle).toBe('SDK Core')
    })
  })

  describe('TS-U-37: Phase E payload contains domain, scopeDescription, completedCycles, recentDecisions', () => {
    it('payload has all required fields', () => {
      const payload = ContextAssembler.buildMemoryPayload(['/path/to/project'], 'workdir')
    })
  })

  describe('Phase B payload contains tasks array', () => {
    it('payload tasks maps to taskId and description only', () => {
      const payload = ContextAssembler.buildDevelopmenPayload(feature, 'workdir', tasks, ['/path'], false)
      expect(payload).toHaveProperty('tasks')
      const payloadTasks = payload.tasks as Array<{ taskId: string; description: string }>
      expect(payloadTasks).toHaveLength(2)
      expect(payloadTasks[0]).toHaveProperty('taskId')
      expect(payloadTasks[0]).toHaveProperty('description')
    })
  })
})
