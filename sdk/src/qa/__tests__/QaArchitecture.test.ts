import { describe, expect, it } from 'vitest'
import { AccessibilityDriver, CliDriver, CurlDriver, McpClientDriver, MobileWebDriver, PlaywrightDriver, WebSocketDriver } from '../engine'
import {
  QaRunStore,
  QaRuntimeManager,
  QaService,
  QaVerdictPolicy,
  probeQaTarget,
} from '../services'

describe('QA module boundaries', () => {
  it('exposes execution adapters from engine', () => {
    expect(CurlDriver).toBeTypeOf('function')
    expect(PlaywrightDriver).toBeTypeOf('function')
    expect(McpClientDriver).toBeTypeOf('function')
    expect(CliDriver).toBeTypeOf('function')
    expect(MobileWebDriver).toBeTypeOf('function')
    expect(AccessibilityDriver).toBeTypeOf('function')
    expect(WebSocketDriver).toBeTypeOf('function')
  })

  it('exposes application services from services', () => {
    expect(QaRunStore).toBeTypeOf('function')
    expect(QaRuntimeManager).toBeTypeOf('function')
    expect(QaService).toBeTypeOf('function')
    expect(QaVerdictPolicy).toBeTypeOf('function')
    expect(probeQaTarget).toBeTypeOf('function')
  })
})
