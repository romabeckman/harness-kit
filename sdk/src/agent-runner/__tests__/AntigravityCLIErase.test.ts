import { describe, expect, it } from 'vitest'
import { AntigravityCLIErase } from '../antigravity-cli/AntigravityCLIErase'

describe('AntigravityCLIErase', () => {
  it('maps only AGY_HOME runtime history and excludes external Gemini paths', () => {
    const manifest = new AntigravityCLIErase({
      platform: 'linux', homeDir: '/home/test', variables: { AGY_HOME: '/runtime/agy', GEMINI_HOME: '/runtime/gemini' },
    }).manifest()
    const entries = manifest.entries.map(entry => entry.relativePath)

    expect(manifest.roots.map(root => root.path)).toEqual(['/runtime/agy'])
    expect(entries).toEqual(expect.arrayContaining(['conversations', 'brain', 'implicit', 'history.jsonl', 'cache', 'logs', 'scratch', 'tmp']))
    expect(entries).not.toEqual(expect.arrayContaining(['config/agents', 'antigravity/mcp_oauth_tokens.json', 'settings.json', 'plugins']))
  })
})
