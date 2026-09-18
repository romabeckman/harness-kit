import { describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { BootstrapHandler } from '../BootstrapHandler'
import { Phase } from '../../types'
import { FORCE_INLINE_MAX } from '../../utils/PromptHelpers'

describe('BootstrapHandler', () => {
  it('uses REFINEMENT.md exclusively when it exists', async () => {
    const productDir = '/test/working-dir/docs/product'
    const refinement = `# Product Backlog\n\n${'PBI-001 '.repeat(FORCE_INLINE_MAX)}`
    const context: any = {
      workingDir: '/test/working-dir',
      config: {
        scope: 'legacy scope must not be used',
        projectPaths: [],
        productDir,
      },
      fsm: {
        ensureProductFiles: vi.fn(),
        loadBootstrapConfig: vi.fn().mockReturnValue({ steeringRules: {} }),
        loadBacklog: vi.fn()
          .mockReturnValueOnce([])
          .mockReturnValueOnce([{ id: 'F001' }]),
        existRefinement: vi.fn().mockReturnValue(true),
        loadRefinement: vi.fn().mockReturnValue(refinement),
        existScope: vi.fn().mockReturnValue(true),
        loadScope: vi.fn().mockReturnValue('scope content must not be used'),
        appendDecision: vi.fn(),
      },
      invokeAgent: vi.fn().mockResolvedValue({ raw: '' }),
    }

    await new BootstrapHandler().handle(Phase.BOOTSTRAP, context)

    const prompt = context.invokeAgent.mock.calls[0][0].prompt as string
    expect(prompt).toContain('<scope_ref>')
    expect(prompt).toContain(`Read file: \`${join(productDir, 'REFINEMENT.md')}\``)
    expect(prompt).not.toContain('SCOPE.md')
    expect(prompt).not.toContain('<scope>')
    expect(prompt).not.toContain('<business_refinement>')
    expect(prompt).not.toContain('legacy scope must not be used')
    expect(context.fsm.loadRefinement).toHaveBeenCalledOnce()
    expect(context.fsm.loadScope).not.toHaveBeenCalled()
  })

  it('uses SCOPE.md when REFINEMENT.md does not exist', async () => {
    const productDir = '/test/working-dir/docs/product'
    const context: any = {
      workingDir: '/test/working-dir',
      config: {
        scope: 'initial scope',
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
        loadRefinement: vi.fn(),
        existScope: vi.fn().mockReturnValue(true),
        loadScope: vi.fn().mockReturnValue('# Scope content'),
        appendDecision: vi.fn(),
      },
      invokeAgent: vi.fn().mockResolvedValue({ raw: '' }),
    }

    await new BootstrapHandler().handle(Phase.BOOTSTRAP, context)

    const prompt = context.invokeAgent.mock.calls[0][0].prompt as string
    expect(prompt).toContain('<scope>')
    expect(prompt).toContain('# Scope content')
    expect(prompt).not.toContain('<scope_ref>')
    expect(prompt).not.toContain(`Read file: \`${join(productDir, 'REFINEMENT.md')}\``)
    expect(context.fsm.loadScope).toHaveBeenCalledOnce()
    expect(context.fsm.loadRefinement).not.toHaveBeenCalled()
  })
})
