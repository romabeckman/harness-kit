import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { afterAll } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/settings/DefaultSettings'

// Each isolated test file owns its global settings; never read or create the developer's configuration.
const directory = mkdtempSync(join(tmpdir(), 'hrns-test-settings-'))
const previousPath = process.env.HARNESS_SETTINGS_PATH
const settingsPath = join(directory, 'settings.json')
writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS), 'utf8')
process.env.HARNESS_SETTINGS_PATH = settingsPath

afterAll(() => {
  if (previousPath === undefined) delete process.env.HARNESS_SETTINGS_PATH
  else process.env.HARNESS_SETTINGS_PATH = previousPath
  if (dirname(directory) !== resolve(tmpdir()) || !basename(directory).startsWith('hrns-test-settings-')) throw new Error('Invalid test settings cleanup path')
  rmSync(directory, { recursive: true, force: true })
})
