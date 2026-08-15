import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { HarnessOrchestrator } from '../HarnessOrchestrator'
import { Complexity, OrchestratorConfig, Phase } from '../types'

function makeTempDir(): string {
  const dir = join(tmpdir(), `orch-test-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('HarnessOrchestrator session management', () => {
  let workingDir: string
  let config: OrchestratorConfig

  beforeEach(() => {
    workingDir = makeTempDir()
    config = {
      scope: 'Test project scope',
      projectPaths: [workingDir],
      complexity: Complexity.LOW,
      agentRunner: {
        run: vi.fn().mockResolvedValue({ success: true, stdout: '', stderr: '', raw: '' }),
      } as any,
    }
  })

  it('manages developer sessions with getDeveloperSession and setDeveloperSession', () => {
    const orchestrator = new HarnessOrchestrator(config, { workingDir })

    expect(orchestrator.getDeveloperSession('harness-kit:developer-backend')).toBeUndefined()

    orchestrator.setDeveloperSession({
      featureId: 'F001',
      agent: 'harness-kit:developer-backend',
      session: { id: 'DEV-1' },
      phase: Phase.DEVELOPMENT,
    })

    orchestrator.setDeveloperSession({
      featureId: 'F001',
      agent: 'harness-kit:harness-tech-lead',
      session: { id: 'TL-1' },
      phase: Phase.REVIEW,
    })

    expect(orchestrator.getDeveloperSession('harness-kit:developer-backend')).toEqual({ id: 'DEV-1' })
    expect(orchestrator.getDeveloperSession('harness-kit:developer-backend', 'F001')).toEqual({ id: 'DEV-1' })
    expect(orchestrator.getDeveloperSession('harness-kit:developer-backend', 'F002')).toBeUndefined()
    expect(orchestrator.getDeveloperSession('harness-kit:harness-tech-lead', 'F001')).toEqual({ id: 'TL-1' })

    // Updating existing session for same feature and agent and phase
    orchestrator.setDeveloperSession({
      featureId: 'F001',
      agent: 'harness-kit:developer-backend',
      session: { id: 'DEV-2' },
      phase: Phase.DEVELOPMENT,
    })

    expect(orchestrator.getDeveloperSession('harness-kit:developer-backend', 'F001')).toEqual({ id: 'DEV-2' })
    expect(orchestrator.developerSession).toHaveLength(2)
  })

  it('isolates sessions for the same agent and feature across different phases', () => {
    const orchestrator = new HarnessOrchestrator(config, { workingDir })

    orchestrator.setDeveloperSession({
      featureId: 'F001',
      agent: 'harness-kit:software-architect',
      session: { id: 'PLANNING-SESSION' },
      phase: Phase.PLANNING,
    })

    orchestrator.setDeveloperSession({
      featureId: 'F001',
      agent: 'harness-kit:software-architect',
      session: { id: 'MEMORY-SESSION' },
      phase: Phase.MEMORY,
    })

    expect(orchestrator.getDeveloperSession('harness-kit:software-architect', 'F001', Phase.PLANNING)).toEqual({ id: 'PLANNING-SESSION' })
    expect(orchestrator.getDeveloperSession('harness-kit:software-architect', 'F001', Phase.MEMORY)).toEqual({ id: 'MEMORY-SESSION' })
    expect(orchestrator.getDeveloperSession('harness-kit:software-architect', 'F001', Phase.DEVELOPMENT)).toBeUndefined()
    expect(orchestrator.developerSession).toHaveLength(2)
  })

  it('manages cumulative planning session across features when featureId is empty string', () => {
    const orchestrator = new HarnessOrchestrator(config, { workingDir })

    orchestrator.setDeveloperSession({
      featureId: '',
      agent: 'harness-kit:software-architect',
      session: { id: 'ACCUMULATED-PLANNING-SESSION' },
      phase: Phase.PLANNING,
    })

    // Searching with empty featureId or undefined returns the cumulative planning session
    expect(orchestrator.getDeveloperSession('harness-kit:software-architect', '', Phase.PLANNING)).toEqual({ id: 'ACCUMULATED-PLANNING-SESSION' })
    expect(orchestrator.getDeveloperSession('harness-kit:software-architect', undefined, Phase.PLANNING)).toEqual({ id: 'ACCUMULATED-PLANNING-SESSION' })
    expect(orchestrator.getDeveloperSession('harness-kit:software-architect')).toEqual({ id: 'ACCUMULATED-PLANNING-SESSION' })

    // Updating existing cumulative session
    orchestrator.setDeveloperSession({
      featureId: '',
      agent: 'harness-kit:software-architect',
      session: { id: 'UPDATED-ACCUMULATED-PLANNING-SESSION' },
      phase: Phase.PLANNING,
    })

    expect(orchestrator.getDeveloperSession('harness-kit:software-architect', undefined, Phase.PLANNING)).toEqual({ id: 'UPDATED-ACCUMULATED-PLANNING-SESSION' })
    expect(orchestrator.developerSession).toHaveLength(1)
  })
})
