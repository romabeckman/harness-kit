import { join } from 'node:path'
import { ContextAssembler } from '../ContextAssembler'
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
    const payload = ContextAssembler.buildPhaseAPayload(feature as any, 'workdir', ['path1'], 'custom scope')
    expect(payload.scope).toBe('custom scope')
    expect(payload.domain).toBe('domain')
    expect(payload.featureTitle).toBe('feature title')
    expect(payload.projectPaths).toEqual(['path1'])
  })

  it('should build phase B payload', () => {
    const feature = { id: '1', title: 'feature title', domain: 'domain' }
    const tasks = [{ taskId: 't1', description: 'task desc' }] as any
    const payload = ContextAssembler.buildPhaseBPayload(feature as any, tasks, ['path1'], false, 0)
    expect(payload.featureId).toBe('1')
    expect(payload.tasks).toHaveLength(1)
  })

  it('should build phase C payload', () => {
    const feature = { id: '1', title: 'feature title', domain: 'domain' }
    const payload = ContextAssembler.buildPhaseCPayload(feature as any, ['path1'])
    expect(payload.featureId).toBe('1')
    expect(payload.domain).toBe('domain')
  })

  it('should build phase E payload', () => {
    const feature = { domain: 'domain', title: 'scope desc' }
    const payload = ContextAssembler.buildPhaseEPayload(['path1'], 'workdir')
  })

  it('should flatten steering rules', () => {
    const feature = { title: 'feature title', domain: 'domain' }
    const steeringRules = {
      planning: ['rule a'],
      user: ['user rule']
    }
    const payload = ContextAssembler.buildPhaseAPayload(feature as any, 'workdir', [], undefined, steeringRules)
    expect(payload.steeringRules).toEqual(['rule a', 'user rule'])
  })
})
