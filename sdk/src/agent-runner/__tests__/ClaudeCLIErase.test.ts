import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ClaudeCLIErase } from '../claude-cli/ClaudeCLIErase'

describe('ClaudeCLIErase', () => {
  it('maps runtime history under CLAUDE_CONFIG_DIR and excludes user configuration', () => {
    const root = path.resolve('sandbox/claude')
    const manifest = new ClaudeCLIErase({ platform: process.platform, homeDir: path.resolve('sandbox'), variables: { CLAUDE_CONFIG_DIR: root } }).manifest()
    const entries = manifest.entries.map(entry => entry.relativePath)

    expect(manifest.roots.map(item => item.path)).toEqual([root])
    expect(entries).toEqual(expect.arrayContaining(['history.jsonl', 'projects', 'sessions', 'agent-memory', 'cache', 'sessions.db-wal']))
    expect(entries).not.toEqual(expect.arrayContaining(['settings.json', 'credentials.json', 'plugins', 'CLAUDE.md']))
  })
})
