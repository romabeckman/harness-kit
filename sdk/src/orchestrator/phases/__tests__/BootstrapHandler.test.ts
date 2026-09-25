import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

  it('invokes project-memory once to inspect each configured project independently', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bootstrap-docs-test-'))
    const documentedProject = join(root, 'documented')
    const firstUndocumentedProject = join(root, 'undocumented-first')
    const secondUndocumentedProject = join(root, 'undocumented-second')
    const events: string[] = []
    mkdirSync(join(documentedProject, 'docs'), { recursive: true })
    writeFileSync(join(documentedProject, 'docs', '.digest.md'), '# Digest')
    writeFileSync(join(documentedProject, 'docs', '.graph.json'), '{"nodes":[],"edges":[]}')
    mkdirSync(firstUndocumentedProject, { recursive: true })
    mkdirSync(join(secondUndocumentedProject, 'docs'), { recursive: true })
    writeFileSync(join(secondUndocumentedProject, 'docs', '.digest.md'), '# Digest')
    const context: any = {
      workingDir: root,
      config: {
        scope: 'initial scope',
        projectPaths: [documentedProject, firstUndocumentedProject, secondUndocumentedProject],
        productDir: join(root, 'state', 'docs', 'product'),
        agentRunner: { writePromptToStdin: false },
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
      invokeAgent: vi.fn().mockImplementation(async (invocation: any) => {
        events.push(invocation.skill === 'harness-kit:project-memory' ? 'project-memory' : 'bootstrap')
        return { raw: '' }
      }),
    }
    const preparationMessage = vi.spyOn(console, 'log').mockImplementation(() => {
      events.push('preparation-message')
    })

    try {
      await new BootstrapHandler().handle(Phase.BOOTSTRAP, context)

      const memoryCalls = context.invokeAgent.mock.calls.filter(
        (call: any[]) => call[0].skill === 'harness-kit:project-memory',
      )
      expect(memoryCalls).toHaveLength(1)
      expect(memoryCalls[0][0].prompt).toContain('Inspect every configured project independently')
      expect(memoryCalls[0][0].prompt).toContain(documentedProject)
      expect(memoryCalls[0][0].prompt).toContain(firstUndocumentedProject)
      expect(memoryCalls[0][0].prompt).toContain(secondUndocumentedProject)
      expect(memoryCalls[0][0].prompt).toContain('docs/.digest.md')
      expect(memoryCalls[0][0].prompt).toContain('docs/.graph.json')
      expect(memoryCalls[0][0].prompt).toContain('docs/adr/ARCHITECTURE.md')
      expect(memoryCalls[0][0].prompt).toContain('docs/feature')
      expect(memoryCalls[0][0].prompt).toContain('<scope_ref>')
      expect(memoryCalls[0][0].prompt).toContain(
        `Read file: \`${join(root, 'state', 'docs', 'product', 'SCOPE.md')}\``,
      )
      expect(memoryCalls[0][0].workspacePath).toBeUndefined()
      expect(preparationMessage).toHaveBeenCalledOnce()
      expect(preparationMessage.mock.calls[0][0]).toContain(firstUndocumentedProject)
      expect(preparationMessage.mock.calls[0][0]).toContain(secondUndocumentedProject)
      expect(events).toEqual([
        'preparation-message', 'project-memory', 'bootstrap',
      ])
      expect(context.invokeAgent.mock.calls.some(
        (call: any[]) => call[0].skill !== 'harness-kit:project-memory',
      )).toBe(true)
      expect(existsSync(join(documentedProject, 'docs'))).toBe(true)
    } finally {
      preparationMessage.mockRestore()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not invoke project-memory when every project already has docs', async () => {
    const project = mkdtempSync(join(tmpdir(), 'bootstrap-existing-docs-'))
    mkdirSync(join(project, 'docs'))
    writeFileSync(join(project, 'docs', '.digest.md'), '# Digest')
    writeFileSync(join(project, 'docs', '.graph.json'), '{"nodes":[],"edges":[]}')
    const context: any = {
      workingDir: project,
      config: {
        scope: 'initial scope',
        projectPaths: [project],
        productDir: join(project, 'state', 'docs', 'product'),
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

    try {
      await new BootstrapHandler().handle(Phase.BOOTSTRAP, context)

      expect(context.invokeAgent.mock.calls).toHaveLength(1)
      expect(context.invokeAgent.mock.calls[0][0].skill).not.toBe('harness-kit:project-memory')
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })
})
