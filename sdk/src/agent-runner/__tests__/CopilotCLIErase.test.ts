import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CopilotCLIErase } from '../copilot-cli/CopilotCLIErase'

describe('CopilotCLIErase', () => {
  it('uses macOS cache default and maps runtime data without installed plugins', () => {
    const homeDir = path.posix.resolve('/sandbox/home')
    const manifest = new CopilotCLIErase({ platform: 'darwin', homeDir, variables: {} }).manifest()
    const entries = manifest.entries.map(entry => entry.relativePath)

    expect(manifest.roots.map(root => root.path)).toContain(path.posix.join(homeDir, 'Library/Caches/copilot'))
    expect(entries).toEqual(expect.arrayContaining(['session-state', 'command-history-state', 'session-store.db-wal', 'logs', 'ide', 'plugin-data', '.']))
    expect(entries).not.toContain('installed-plugins')
  })

  it('uses injected XDG cache on Linux-like platforms', () => {
    const manifest = new CopilotCLIErase({
      platform: 'linux', homeDir: '/home/test', variables: { XDG_CACHE_HOME: '/runtime/cache', COPILOT_HOME: '/runtime/copilot' },
    }).manifest()
    expect(manifest.roots.map(root => root.path)).toContain('/runtime/cache/copilot')
  })

  it('rejects a cache root that overlaps the runtime root', async () => {
    const erase = new CopilotCLIErase({
      platform: 'linux', homeDir: '/home/test', variables: { COPILOT_HOME: '/runtime/copilot', COPILOT_CACHE_HOME: '/runtime/copilot' },
    })

    await expect(erase.discover()).rejects.toThrow(/overlapping approved roots/i)
  })
})
