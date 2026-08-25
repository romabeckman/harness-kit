import { join } from 'node:path'
import { ContextAssembler } from '../ContextAssembler'
import { tmpdir } from 'node:os'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

describe('ContextAssembler', () => {
  it('should build bootstrap payload', () => {
    const productDir = join('prod/dir')
    const payload = ContextAssembler.buildBootstrapPayload('scope', ['path1'], productDir)
    expect(payload.scope).toBe('scope')
    expect(payload.projectPaths).toEqual(['path1'])
    expect(payload.backlogPath).toBe(join(productDir, 'BACKLOG.md'))
  })

  it('should build phase A payload', () => {
    const feature = { title: 'feature title', domain: 'domain' }
    const payload = ContextAssembler.buildPlanningPayload(feature as any, 'workdir', ['path1'], 'custom scope')
    expect(payload.scope).toBe('custom scope')
    expect(payload.domain).toBe('domain')
    expect(payload.featureTitle).toBe('feature title')
    expect(payload.projectPaths).toEqual(['path1'])
  })

  it('should build phase B payload', () => {
    const feature = { id: '1', title: 'feature title', domain: 'domain' }
    const tasks = [{ taskId: 't1', description: 'task desc' }] as any
    const payload = ContextAssembler.buildDevelopmenPayload(feature as any, 'workdir', tasks, ['path1'], false, 0)
    expect(payload.featureId).toBe('1')
    expect(payload.tasks).toHaveLength(1)
  })

  it('should build phase C payload', () => {
    const feature = { id: '1', title: 'feature title', domain: 'domain' }
    const workingDir = mkdtempSync(join(tmpdir(), 'context-assembler-'))
    mkdirSync(join(workingDir, 'docs', 'specs', 'domain'), { recursive: true })
    writeFileSync(join(workingDir, 'docs', 'specs', 'domain', 'TDD-OUTPUT.json'), JSON.stringify({
      featureId: '1',
      status: 'SUCCESS',
      metrics: { totalTests: 1, passed: 1, failed: 0, coverage: 1 },
      modifiedFiles: [],
      developerHandoff: 'Implemented typed handoff.',
      reworksCount: 0,
    }))
    const payload = ContextAssembler.buildReviewPayload(feature as any, workingDir, ['path1'])
    expect(payload.featureId).toBe('1')
    expect(payload.domain).toBe('domain')
    expect(payload.developerHandoff).toBe('Implemented typed handoff.')
    rmSync(workingDir, { recursive: true, force: true })
  })

  it('should build phase E payload', () => {
    const feature = { domain: 'domain', title: 'scope desc' }
    const payload = ContextAssembler.buildMemoryPayload(['path1'], 'workdir')
  })

  it('should flatten steering rules', () => {
    const feature = { title: 'feature title', domain: 'domain' }
    const steeringRules = {
      planning: ['rule a'],
      user: ['user rule']
    }
    const payload = ContextAssembler.buildPlanningPayload(feature as any, 'workdir', [], undefined, steeringRules)
    expect(payload.steeringRules).toEqual(['rule a', 'user rule'])
  })
})
