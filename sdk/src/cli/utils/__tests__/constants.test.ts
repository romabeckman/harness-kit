import { describe, it, expect } from 'vitest'
import {
  HELP,
  HELP_RUN,
  HELP_INIT,
  HELP_SETTINGS,
  HELP_DIAGNOSE,
  HELP_REPORT,
  HELP_VERSION,
  COMMAND_HELP,
} from '../constants'

describe('CLI Constants & Subcommand Help', () => {
  it('contains main HELP text with command overview', () => {
    expect(HELP).toContain('USAGE')
    expect(HELP).toContain('COMMANDS')
    expect(HELP).toContain('run')
    expect(HELP).toContain('init')
    expect(HELP).toContain('settings')
    expect(HELP).toContain('diagnose')
    expect(HELP).toContain('report')
    expect(HELP).toContain('version')
  })

  it('contains detailed HELP_RUN with options and examples', () => {
    expect(HELP_RUN).toContain('hrns run [options]')
    expect(HELP_RUN).toContain('--diagnose')
    expect(HELP_RUN).toContain('--reset')
    expect(HELP_RUN).toContain('--resume')
    expect(HELP_RUN).toContain('--mode')
    expect(HELP_RUN).toContain('--skip-validation')
    expect(HELP_RUN).toContain('--skip-memory')
    expect(HELP_RUN).toContain('--skip-deploy')
  })

  it('contains detailed HELP_INIT with created files', () => {
    expect(HELP_INIT).toContain('hrns init')
    expect(HELP_INIT).toContain('docs/product/')
    expect(HELP_INIT).toContain('steering-rules.md')
  })

  it('contains detailed HELP_SETTINGS with actions', () => {
    expect(HELP_SETTINGS).toContain('hrns settings')
    expect(HELP_SETTINGS).toContain('edit')
    expect(HELP_SETTINGS).toContain('renew')
    expect(HELP_SETTINGS).toContain('delete')
  })

  it('contains detailed HELP_DIAGNOSE with batch and model options', () => {
    expect(HELP_DIAGNOSE).toContain('hrns diagnose')
    expect(HELP_DIAGNOSE).toContain('--batch-size')
    expect(HELP_DIAGNOSE).toContain('--agent')
    expect(HELP_DIAGNOSE).toContain('--model')
  })

  it('contains detailed HELP_REPORT', () => {
    expect(HELP_REPORT).toContain('hrns report')
    expect(HELP_REPORT).toContain('tokens.jsonl')
  })

  it('contains HELP_VERSION', () => {
    expect(HELP_VERSION).toContain('hrns version')
  })

  it('maps all subcommands in COMMAND_HELP', () => {
    expect(COMMAND_HELP['run']).toBe(HELP_RUN)
    expect(COMMAND_HELP['init']).toBe(HELP_INIT)
    expect(COMMAND_HELP['settings']).toBe(HELP_SETTINGS)
    expect(COMMAND_HELP['diagnose']).toBe(HELP_DIAGNOSE)
    expect(COMMAND_HELP['report']).toBe(HELP_REPORT)
    expect(COMMAND_HELP['version']).toBe(HELP_VERSION)
  })
})
