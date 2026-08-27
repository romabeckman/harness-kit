import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CodexCLIErase } from '../codex-cli/CodexCLIErase'

describe('CodexCLIErase', () => {
  it('maps Codex runtime state while preserving configuration and plugin payload cache', () => {
    const root = path.resolve('sandbox/codex')
    const manifest = new CodexCLIErase({ platform: process.platform, homeDir: path.resolve('sandbox'), variables: { CODEX_HOME: root } }).manifest()
    const entries = manifest.entries.map(entry => entry.relativePath)

    expect(manifest.roots.map(item => item.path)).toEqual([root])
    expect(entries).toEqual(expect.arrayContaining(['history.jsonl', 'sessions', 'archived_sessions', 'cache', 'shell_snapshots']))
    expect(manifest.entries.some(entry => entry.fileNamePattern?.includes('state_'))).toBe(true)
    expect(entries).not.toEqual(expect.arrayContaining(['auth.json', 'config.toml', 'plugins', 'plugins/cache', 'RTK.md', 'AGENTS.md']))
  })
})
