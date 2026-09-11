import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cmdQa, parseQaArgs } from '../qa-service'
import { QaRunStore } from '../../../qa/QaRunStore'

describe('QA CLI', () => {
  let workspace: string
  let log: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'hrns-qa-cli-'))
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    log.mockRestore()
    rmSync(workspace, { recursive: true, force: true })
  })

  it('parses plan options without an agent runner', () => {
    expect(parseQaArgs(['plan', '--plan', 'orders', '--target', 'http://localhost:3000', '--criterion', 'Order saves'])).toMatchObject({
      action: 'plan', planId: 'orders', target: 'http://localhost:3000', criteria: ['Order saves'],
    })
  })

  it('writes a standalone plan', async () => {
    await cmdQa(workspace, ['plan', '--plan', 'orders', '--target', 'http://localhost:3000', '--criterion', 'Order saves', '--method', 'POST', '--path', '/orders', '--expect-status', '201'])

    expect(log).toHaveBeenCalledWith(expect.stringContaining('QA plan saved: orders@1'))
    expect(new QaRunStore(workspace).loadPlan('orders', 1).scenarios[0].request).toEqual({ method: 'POST', path: '/orders', expectedStatus: 201 })
  })
})
