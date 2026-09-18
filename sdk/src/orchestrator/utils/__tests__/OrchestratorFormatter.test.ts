import { afterEach, describe, expect, it, vi } from 'vitest'
import { Phase } from '../../types'
import { OrchestratorFormatter } from '../OrchestratorFormatter'

describe('OrchestratorFormatter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prints refinement before bootstrap in the pipeline state', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    OrchestratorFormatter.printPipelineHeader(Phase.REFINEMENT)

    const output = stripAnsi(log.mock.calls[0]?.[0] as string)
    expect(output).toContain('── Pipeline State: [● REFINEMENT →   BOOTSTRAP →   PLANNING →   DEVELOPMENT →   REVIEW →   TRANSITION →   MEMORY →   DEPLOY] ──')
  })
})

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '')
}
