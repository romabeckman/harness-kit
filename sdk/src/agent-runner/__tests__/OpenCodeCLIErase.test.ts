import { describe, expect, it } from 'vitest'
import { OpenCodeCLIErase } from '../opencode-cli/OpenCodeCLIErase'

describe('OpenCodeCLIErase', () => {
  it('maps XDG data, cache, and state while excluding config and downloaded tools', () => {
    const manifest = new OpenCodeCLIErase({
      platform: 'linux',
      homeDir: '/home/test',
      variables: { XDG_DATA_HOME: '/xdg/data', XDG_CACHE_HOME: '/xdg/cache', XDG_STATE_HOME: '/xdg/state', XDG_CONFIG_HOME: '/xdg/config' },
    }).manifest()
    const roots = manifest.roots.map(root => root.path)
    const entries = manifest.entries.map(entry => entry.relativePath)

    expect(roots).toEqual(['/xdg/data/opencode', '/xdg/cache/opencode', '/xdg/state/opencode'])
    expect(entries).toEqual(expect.arrayContaining(['storage', 'project', 'snapshot', 'tool-output', 'sessions', 'opencode.db-wal', '.']))
    expect(entries).not.toEqual(expect.arrayContaining(['bin', 'auth.json', 'service.json', 'plugins']))
    expect(roots).not.toContain('/xdg/config/opencode')
  })

  it('rejects overlapping XDG data and cache roots', async () => {
    const erase = new OpenCodeCLIErase({
      platform: 'linux', homeDir: '/home/test',
      variables: { XDG_DATA_HOME: '/xdg/shared', XDG_CACHE_HOME: '/xdg/shared', XDG_STATE_HOME: '/xdg/state' },
    })

    await expect(erase.discover()).rejects.toThrow(/overlapping approved roots/i)
  })
})
