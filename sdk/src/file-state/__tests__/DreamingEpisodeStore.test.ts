import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DreamingEpisodeStore } from '../DreamingEpisodeStore'
import type { Feature, Task } from '../types'
import type { TddOutput } from '../../orchestrator/utils/PhaseFileUtils'

describe('DreamingEpisodeStore', () => {
  let workingDir: string
  let productDir: string
  let store: DreamingEpisodeStore
  const feature: Feature = {
    id: 'F001', title: 'Recovery', domain: 'recovery', priority: 1, dependencies: [],
    reworks: 0, scoreTL: null, scoreAdv: null, status: 'IN_PROGRESS',
  }
  const task: Task = {
    featureId: feature.id, domain: feature.domain, taskId: 'T01', project: 'sdk',
    description: 'Verify recovery', status: 'IN_PROGRESS', currentPhase: 'IMPLEMENTATION',
  }
  const output: TddOutput = {
    featureId: feature.id, reworksCount: 0, status: 'SUCCESS', modifiedFiles: ['retry.test.ts'],
    metrics: { passed: 1, totalTests: 1, failed: 0, coverage: 100 },
    orientation_use: [{
      orientation_id: 'persisted-retry', revision: 1, feature: 'feature:recovery', project: 'sdk',
      decision: 'covered', reason: 'Equivalent recovery test exists', test_ref: 'SC-01',
    }],
  }

  beforeEach(() => {
    workingDir = mkdtempSync(join(tmpdir(), 'dreaming-episodes-'))
    productDir = join(workingDir, 'docs', 'product')
    mkdirSync(join(workingDir, 'sdk'))
    store = new DreamingEpisodeStore(workingDir, productDir)
  })

  afterEach(() => rmSync(workingDir, { recursive: true, force: true }))

  it('resumes only an accepted handoff for the same attempt and tasks', () => {
    store.recordDevelopment(feature, output, [task], ['sdk'], 'developer-session')
    const resumed = new DreamingEpisodeStore(workingDir, productDir)
    expect(resumed.canResume(feature, output, [task])).toBe(true)
    expect(resumed.canResume(feature, { ...output, modifiedFiles: [] }, [task])).toBe(false)
    expect(resumed.canResume(feature, output, [{ ...task, status: 'NOT_STARTED' }])).toBe(false)
    expect(resumed.canResume(feature, output, [{ ...task, taskId: 'T02' }])).toBe(false)
  })

  it('keeps retry evidence and terminal review separate when a runner reuses its session', () => {
    const finding = { project: 'sdk', path: 'retry.test.ts', locator: 'retains identity', summary: 'Check across processes' }
    writeFileSync(join(workingDir, 'sdk', finding.path), finding.locator)
    store.recordDevelopment(feature, output, [task], ['sdk'], 'developer-session')
    store.recordReview(feature, output, 'RETRY', ['review-session'], [finding, { ...finding, path: '../outside.ts' }])
    const [original] = store.list()
    expect(original.projects[0].findings).toEqual([expect.objectContaining({ path: finding.path })])
    expect(original.projects[0].orientation_use).toEqual(output.orientation_use)
    expect(original.closed).toBeUndefined()

    const retry = { ...feature, reworks: 1 }
    const retryOutput = { ...output, reworksCount: 1, orientation_use: [] }
    store.recordDevelopment(retry, retryOutput, [task], ['sdk'], 'developer-session')
    store.recordReview(retry, retryOutput, 'PASS', ['review-session'])
    store.closeFeature({ ...retry, status: 'COMPLETED' })
    store.closeFeature({ ...retry, status: 'COMPLETED' })

    const attempts = store.list()
    expect(attempts).toHaveLength(2)
    expect(attempts.find(attempt => attempt.reworks === 0)).toMatchObject({ closed: true, review: 'RETRY' })
    expect(attempts.find(attempt => attempt.reworks === 1)).toMatchObject({
      closed: true, review: 'PASS', previousAttemptId: original.id, sourceSessions: ['developer-session', 'review-session'],
      projects: [{ orientation_use: [] }],
    })
  })

  it('does not attribute a projectless decision across multiple owners', () => {
    store.recordDevelopment(feature, {
      ...output, orientation_use: [{ ...output.orientation_use![0], project: undefined }],
    }, [task, { ...task, taskId: 'T02', project: 'web' }], ['sdk', 'web'])
    expect(store.list()[0].projects.map(project => project.orientation_use)).toEqual([undefined, undefined])
  })
})
