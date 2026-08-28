import { describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { BootstrapHandler } from '../BootstrapHandler'
import { Phase } from '../../types'
import { FORCE_INLINE_MAX } from '../../utils/PromptHelpers'

describe('BootstrapHandler', () => {
  it('references SCOPE.md when an always-inline scope exceeds FORCE_INLINE_MAX', async () => {
    const productDir = '/test/working-dir/docs/product'
    const context: any = {
      workingDir: '/test/working-dir',
      config: {
        scope: 'a'.repeat(FORCE_INLINE_MAX + 1),
        projectPaths: [],
        productDir,
      },
      fsm: {
        ensureProductFiles: vi.fn(),
        loadBootstrapConfig: vi.fn().mockReturnValue({ steeringRules: {} }),
        loadBacklog: vi.fn()
          .mockReturnValueOnce([])
          .mockReturnValueOnce([{ id: 'F001' }]),
        existRefinement: vi.fn().mockReturnValue(false),
        appendDecision: vi.fn(),
      },
      invokeAgent: vi.fn().mockResolvedValue({ raw: '' }),
    }

    await new BootstrapHandler().handle(Phase.BOOTSTRAP, context)

    const prompt = context.invokeAgent.mock.calls[0][0].prompt as string
    expect(prompt).toContain('<scope_ref>')
    expect(prompt).toContain(`Read file: \`${join(productDir, 'SCOPE.md')}\``)
    expect(prompt).not.toContain('<scope>')
  })
})
