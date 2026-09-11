import { describe, expect, it } from 'vitest'
import { CurlDriver, PlaywrightDriver } from '../engine'
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
  })

  it('exposes application services from services', () => {
    expect(QaRunStore).toBeTypeOf('function')
    expect(QaRuntimeManager).toBeTypeOf('function')
    expect(QaService).toBeTypeOf('function')
    expect(QaVerdictPolicy).toBeTypeOf('function')
    expect(probeQaTarget).toBeTypeOf('function')
  })
})
