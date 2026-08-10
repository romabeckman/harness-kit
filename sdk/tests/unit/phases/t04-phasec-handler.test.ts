import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, rmSync, readFileSync } from 'node:fs'
import { ReviewHandler } from '../../../src/orchestrator/phases/ReviewHandler'
import { ValidationGate } from '../../../src/validation-gate/ValidationGate'
import { Phase } from '../../../src/orchestrator/types'
import { Verdict } from '../../../src/validation-gate/types'

vi.mock('node:fs')
vi.mock('../../../src/validation-gate/ValidationGate')

describe('ReviewHandler', () => {
  let handler: ReviewHandler
  let mockContext: any
  let mockActiveFeature: any
  let mockConfig: any

  const mockTL = {
    featureId: 'F001',
    score: 0.90,
    openPoints: ['Why is StdoutWriter responsible for writing to stderr?'],
    architectureTip: 'Encapsulate input validation.'
  }

  const mockQA = {
    featureId: 'F001',
    score: 0.90,
    passedAdversarial: true,
    vulnerabilities: [{ type: 'DATA_EXPOSURE', severity: 'LOW', description: 'Exposing raw traceback' }],
    edgeCasesMissed: ['Lazy import of traceback module']
  }

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new ReviewHandler()

    mockActiveFeature = { id: 'F001', domain: 'cli', reworks: 0 }
    mockConfig = {
      scoreThresholdTL: 0.8,
      scoreThresholdAdv: 0.8
    }

    mockContext = {
      workingDir: '/mock/dir',
      config: { projectPaths: ['/src'] },
      invokeAgent: vi.fn().mockResolvedValue({ raw: '{}', artefacts: {} }),
      getActiveFeature: vi.fn().mockReturnValue(mockActiveFeature),
      fsm: {
        loadBacklog: vi.fn().mockReturnValue([]),
        loadBootstrapConfig: vi.fn().mockReturnValue(mockConfig),
        saveBootstrapConfig: vi.fn(),
        appendDecision: vi.fn(),
        updateFeatureStatus: vi.fn(),
        incrementReworks: vi.fn(),
        writeReworkLog: vi.fn(),
        updateAllFeatureTasks: vi.fn()
      }
    }
  })

  it('deve aprovar (PASS) com os JSONs reais do TL e QA', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation((path) => {
      if (path.toString().endsWith('TL.json')) return JSON.stringify(mockTL)
      if (path.toString().endsWith('QA.json')) return JSON.stringify(mockQA)
      return ''
    })

    vi.mocked(ValidationGate.evaluate).mockReturnValue({ verdict: Verdict.PASS, reason: 'Passed thresholds' })

    const result = await handler.handle(Phase.REVIEW, mockContext)

    expect(readFileSync).toHaveBeenCalledWith(expect.stringContaining('TL.json'), 'utf8')
    expect(readFileSync).toHaveBeenCalledWith(expect.stringContaining('QA.json'), 'utf8')
    expect(mockContext.fsm.updateFeatureStatus).toHaveBeenCalledWith('F001', 'COMPLETED', { tl: 0.9, adv: 0.9 })
    expect(mockContext.fsm.updateAllFeatureTasks).toHaveBeenCalledWith('F001', '-', 'COMPLETED')
    expect(result).toBe(Phase.TRANSITION)
  })

  it('passes validation thresholds and current output contracts to both review prompts', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation((path) => {
      if (path.toString().endsWith('TL.json')) return JSON.stringify(mockTL)
      if (path.toString().endsWith('QA.json')) return JSON.stringify(mockQA)
      return ''
    })
    vi.mocked(ValidationGate.evaluate).mockReturnValue({ verdict: Verdict.PASS, reason: 'Passed thresholds' })

    await handler.handle(Phase.REVIEW, mockContext)

    const tlPrompt = mockContext.invokeAgent.mock.calls[0][0].prompt as string
    const qaPrompt = mockContext.invokeAgent.mock.calls[1][0].prompt as string
    expect(tlPrompt).toContain('scoreThresholdTL: 0.8')
    expect(tlPrompt).toContain('0–6 Socratic questions')
    expect(tlPrompt).not.toContain('"isCrashing"')
    expect(qaPrompt).toContain('scoreThresholdAdv: 0.8')
    expect(qaPrompt).toContain('no Markdown fences or prose')
    expect(qaPrompt).not.toContain('SQL_INJECTION|XSS')
  })

  it('deve solicitar RETRY se QA identificar falha grave no payload', async () => {
    vi.mocked(existsSync).mockReturnValue(true)

    const failedQA = { ...mockQA, score: 0.6, vulnerabilities: [{ type: 'AUTH_BYPASS', severity: 'CRITICAL', description: 'Missing auth check' }] }
    vi.mocked(readFileSync).mockImplementation((path) => {
      if (path.toString().endsWith('TL.json')) return JSON.stringify(mockTL)
      if (path.toString().endsWith('QA.json')) return JSON.stringify(failedQA)
      return ''
    })

    vi.mocked(ValidationGate.evaluate).mockReturnValue({ verdict: Verdict.RETRY, reason: 'Critical Vuln' })

    const result = await handler.handle(Phase.REVIEW, mockContext)

    expect(mockContext.fsm.incrementReworks).toHaveBeenCalledWith('F001')
    // Content must be structured markdown built from raw score arrays — not a flat string
    const [domain, content] = mockContext.fsm.writeReworkLog.mock.calls[0] as [string, string]
    expect(domain).toBe('cli')
    expect(content).toContain('### Action Items (Tech Lead)')
    expect(content).toContain('Why is StdoutWriter')
    expect(content).toContain('### Vulnerabilities')
    expect(content).toContain('[CRITICAL]')
    expect(content).toContain('Missing auth check')
    expect(result).toBe(Phase.DEVELOPMENT)
  })

  it('deve usar writeReworkLog com fallback quando todos os arrays estão vazios em RETRY', async () => {
    vi.mocked(existsSync).mockReturnValue(true)

    const emptyTL = { featureId: 'F001', score: 0.5, openPoints: [], architectureTip: undefined }
    const emptyQA = { featureId: 'F001', score: 0.5, passedAdversarial: false, vulnerabilities: [], edgeCasesMissed: [] }
    vi.mocked(readFileSync).mockImplementation((path) => {
      if (path.toString().endsWith('TL.json')) return JSON.stringify(emptyTL)
      if (path.toString().endsWith('QA.json')) return JSON.stringify(emptyQA)
      return ''
    })

    vi.mocked(ValidationGate.evaluate).mockReturnValue({ verdict: Verdict.RETRY, reason: 'Scores below threshold' })

    await handler.handle(Phase.REVIEW, mockContext)

    const [, content] = mockContext.fsm.writeReworkLog.mock.calls[0] as [string, string]
    expect(typeof content).toBe('string')
    expect(content.length).toBeGreaterThan(0)
  })

  it('deve processar corretamente com payloads complexos de TL.json e QA.json fornecidos', async () => {
    const complexQA = {
      featureId: 'F001',
      score: 0.90,
      passedAdversarial: true,
      vulnerabilities: [
        {
          type: 'DATA_EXPOSURE',
          severity: 'LOW',
          description: 'Exposing raw traceback to stderr on execution failure may disclose sensitive local directory structure or file paths.'
        }
      ],
      edgeCasesMissed: [
        'Lazy import of traceback module inside exception handler might fail under system resource/memory depletion.',
        'Stderr writer failure (e.g. broken pipe or write error) during exception handling is not caught, leading to unhandled exception bubbling.'
      ]
    }

    const complexTL = {
      featureId: 'F001',
      score: 0.90,
      openPoints: [
        'Why is StdoutWriter responsible for writing to stderr? Does this violate naming cohesion and the Single Responsibility Principle?',
        'Why is the traceback module imported lazily inside the exception block? How does this affect reliability if the system is low on memory or handles critical import errors?',
        'Should input validation for shell injection characters be handled directly by the CLIApplication controller, or should it be encapsulated in a dedicated parsing or validation component?',
        'What happens if the StdoutWriter itself raises an exception (e.g. BrokenPipeError)? How does the exception handling in CLIApplication.run protect against failures during error reporting?'
      ],
      architectureTip: 'Encapsulate input validation and output formatting in dedicated components to keep the application controller focused on flow coordination.'
    }

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation((path) => {
      if (path.toString().endsWith('TL.json')) return JSON.stringify(complexTL)
      if (path.toString().endsWith('QA.json')) return JSON.stringify(complexQA)
      return ''
    })

    vi.mocked(ValidationGate.evaluate).mockReturnValue({ verdict: Verdict.PASS, reason: 'Passed complex thresholds' })

    const result = await handler.handle(Phase.REVIEW, mockContext)

    expect(readFileSync).toHaveBeenCalledWith(expect.stringContaining('TL.json'), 'utf8')
    expect(readFileSync).toHaveBeenCalledWith(expect.stringContaining('QA.json'), 'utf8')
    expect(mockContext.fsm.updateFeatureStatus).toHaveBeenCalledWith('F001', 'COMPLETED', { tl: 0.9, adv: 0.9 })
    expect(mockContext.fsm.updateAllFeatureTasks).toHaveBeenCalledWith('F001', '-', 'COMPLETED')
    expect(result).toBe(Phase.TRANSITION)
  })

  it('deve limpar TL.json e QA.json no início de cada execução para evitar decisão com dados stale em retry', async () => {
    const removedFiles: string[] = []
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(rmSync).mockImplementation((path) => { removedFiles.push(path.toString()) })
    vi.mocked(readFileSync).mockImplementation((path) => {
      if (path.toString().endsWith('TL.json')) return JSON.stringify(mockTL)
      if (path.toString().endsWith('QA.json')) return JSON.stringify(mockQA)
      return ''
    })
    vi.mocked(ValidationGate.evaluate).mockReturnValue({ verdict: Verdict.PASS, reason: 'Passed' })

    await handler.handle(Phase.REVIEW, mockContext)

    expect(removedFiles.some(p => p.endsWith('TL.json'))).toBe(true)
    expect(removedFiles.some(p => p.endsWith('QA.json'))).toBe(true)
  })

  it('deve extrair campos de forma defensiva para evitar crashes com payloads malformados', async () => {
    const malformedTL = {
      featureId: 'F001',
      score: 0.90,
      openPoints: "I am a string, not an array!", // Tipo inválido
      architectureTip: { tip: "I am an object" } // Tipo inválido
    }

    const malformedQA = {
      featureId: 'F001',
      score: 0.90,
      passedAdversarial: true,
      vulnerabilities: "String vuln", // Tipo inválido
      edgeCasesMissed: { missed: true } // Tipo inválido
    }

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation((path) => {
      if (path.toString().endsWith('TL.json')) return JSON.stringify(malformedTL)
      if (path.toString().endsWith('QA.json')) return JSON.stringify(malformedQA)
      return ''
    })

    vi.mocked(ValidationGate.evaluate).mockReturnValue({ verdict: Verdict.PASS, reason: 'Passed' })

    await handler.handle(Phase.REVIEW, mockContext)

    expect(ValidationGate.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        openPoints: [],
        architectureTip: undefined,
        vulnerabilities: [],
        edgeCasesMissed: []
      }),
      0,
      mockConfig
    )
  })

  it('deve pular Phase C inteira quando skipValidation=true no config', async () => {
    mockContext.config = { projectPaths: ['/src'], skipValidation: true }

    const result = await handler.handle(Phase.REVIEW, mockContext)

    // No agent must be called
    expect(mockContext.invokeAgent).not.toHaveBeenCalled()
    // Must mark feature COMPLETED with neutral scores
    expect(mockContext.fsm.updateFeatureStatus).toHaveBeenCalledWith('F001', 'COMPLETED', { tl: 1, adv: 1 })
    expect(mockContext.fsm.updateAllFeatureTasks).toHaveBeenCalledWith('F001', '-', 'COMPLETED')
    // Must go straight to Phase D
    expect(result).toBe(Phase.TRANSITION)
  })
})
