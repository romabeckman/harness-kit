import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defaultProgress, extractJsonOrNull } from '../../src/agent-runner/CliRunnerProgress'

describe('T25 — CliRunnerProgress', () => {
  let stderrSpy: any

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stderrSpy.mockRestore()
  })

  it('TC-CRP-01: writes text preview on type=text with text', () => {
    // Arrange
    const line = { agent: 'a', skill: 'my-skill', type: 'text' as const, text: 'hello\nworld' }

    // Act
    defaultProgress(line)

    // Assert
    expect(stderrSpy).toHaveBeenCalledWith('[my-skill] hello world\n')
  })

  it('TC-CRP-02: does not write on type=text without text', () => {
    // Arrange
    const line = { agent: 'a', skill: 'my-skill', type: 'text' as const }

    // Act
    defaultProgress(line)

    // Assert
    expect(stderrSpy).not.toHaveBeenCalled()
  })

  it('TC-CRP-03: writes arrow on type=tool_use with toolName', () => {
    // Arrange
    const line = { agent: 'a', skill: 'my-skill', type: 'tool_use' as const, toolName: 'run_command' }

    // Act
    defaultProgress(line)

    // Assert
    expect(stderrSpy).toHaveBeenCalledWith('[my-skill] → run_command\n')
  })

  it('TC-CRP-04: does not write on type=tool_use without toolName', () => {
    // Arrange
    const line = { agent: 'a', skill: 'my-skill', type: 'tool_use' as const }

    // Act
    defaultProgress(line)

    // Assert
    expect(stderrSpy).not.toHaveBeenCalled()
  })

  it('TC-CRP-05: writes done on type=result', () => {
    // Arrange
    const line = { agent: 'a', skill: 'my-skill', type: 'result' as const }

    // Act
    defaultProgress(line)

    // Assert
    expect(stderrSpy).toHaveBeenCalledWith('[my-skill] ✓ done\n')
  })

  it('TC-CRP-06: extractJsonOrNull returns parsed object on valid JSON fenced block', () => {
    // Arrange
    const content = 'Some text ```json\n{"hello": "world"}\n``` other text'

    // Act
    const res = extractJsonOrNull(content)

    // Assert
    expect(res).toEqual({ hello: 'world' })
  })

  it('TC-CRP-07: extractJsonOrNull returns null on invalid/missing JSON fenced block', () => {
    // Arrange
    const content = 'No json block here'

    // Act
    const res = extractJsonOrNull(content)

    // Assert
    expect(res).toBeNull()
  })
})
