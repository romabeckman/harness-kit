import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { HarnessOrchestrator } from '../HarnessOrchestrator'
import { Complexity, OrchestratorConfig } from '../types'

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
    })

    orchestrator.setDeveloperSession({
      featureId: 'F001',
      agent: 'harness-kit:harness-tech-lead',
      session: { id: 'TL-1' },
    })

    expect(orchestrator.getDeveloperSession('harness-kit:developer-backend')).toEqual({ id: 'DEV-1' })
    expect(orchestrator.getDeveloperSession('harness-kit:developer-backend', 'F001')).toEqual({ id: 'DEV-1' })
    expect(orchestrator.getDeveloperSession('harness-kit:developer-backend', 'F002')).toBeUndefined()
    expect(orchestrator.getDeveloperSession('harness-kit:harness-tech-lead', 'F001')).toEqual({ id: 'TL-1' })

    // Updating existing session for same feature and agent
    orchestrator.setDeveloperSession({
      featureId: 'F001',
      agent: 'harness-kit:developer-backend',
      session: { id: 'DEV-2' },
    })

    expect(orchestrator.getDeveloperSession('harness-kit:developer-backend', 'F001')).toEqual({ id: 'DEV-2' })
    expect(orchestrator.developerSession).toHaveLength(2)
  })
})
