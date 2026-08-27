import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runCliErase } from '../helpers/CliRunner'
import { SandboxEnvironment } from '../helpers/SandboxEnvironment'

describe('compiled hrns erase', () => {
  let sandbox: SandboxEnvironment | null = null

  afterEach(async () => {
    if (sandbox) await sandbox.cleanup()
    sandbox = null
  })

  it('deletes confirmed Claude runtime history and preserves protected files', async () => {
    sandbox = new SandboxEnvironment()
    const directory = await sandbox.create()
    const runtime = path.join(directory, 'claude')
    await mkdir(path.join(runtime, 'projects'), { recursive: true })
    await writeFile(path.join(runtime, 'projects', 'session.jsonl'), 'history')
    await writeFile(path.join(runtime, 'settings.json'), 'settings-secret')

    const result = await runCliErase(sandbox, directory, ['--target', 'claude-code'], { CLAUDE_CONFIG_DIR: runtime }, 'y\n')

    expect(result.exitCode).toBe(0)
    await expect(readFile(path.join(runtime, 'projects', 'session.jsonl'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(path.join(runtime, 'settings.json'), 'utf8')).toBe('settings-secret')
    expect(result.stdout).not.toContain('settings-secret')
  })

  it.each([
    {
      target: 'codex', variables: (directory: string) => ({ CODEX_HOME: path.join(directory, 'codex') }),
      mapped: ['codex', 'sessions', 'thread.jsonl'], protected: ['codex', 'auth.json'],
    },
    {
      target: 'copilot', variables: (directory: string) => ({
        COPILOT_HOME: path.join(directory, 'copilot'), COPILOT_CACHE_HOME: path.join(directory, 'copilot-cache'),
      }),
      mapped: ['copilot', 'session-state', 'thread.jsonl'], protected: ['copilot', 'installed-plugins', 'plugin.json'],
    },
    {
      target: 'antigravity', variables: (directory: string) => ({ AGY_HOME: path.join(directory, 'agy'), GEMINI_HOME: path.join(directory, 'gemini') }),
      mapped: ['agy', 'conversations', 'thread.jsonl'], protected: ['gemini', 'config', 'agents', 'global.md'],
    },
    {
      target: 'opencode', variables: (directory: string) => ({
        XDG_DATA_HOME: path.join(directory, 'data'), XDG_CACHE_HOME: path.join(directory, 'cache'),
        XDG_STATE_HOME: path.join(directory, 'state'), XDG_CONFIG_HOME: path.join(directory, 'config'),
      }),
      mapped: ['data', 'opencode', 'storage', 'thread.jsonl'], protected: ['data', 'opencode', 'bin', 'tool.exe'],
    },
  ])('erases mapped $target history and preserves protected payloads', async fixture => {
    sandbox = new SandboxEnvironment()
    const directory = await sandbox.create()
    const mappedPath = path.join(directory, ...fixture.mapped)
    const protectedPath = path.join(directory, ...fixture.protected)
    await mkdir(path.dirname(mappedPath), { recursive: true })
    await mkdir(path.dirname(protectedPath), { recursive: true })
    await writeFile(mappedPath, 'history')
    await writeFile(protectedPath, 'protected')

    const result = await runCliErase(sandbox, directory, ['--target', fixture.target], fixture.variables(directory), 'y\n')

    expect(result.exitCode).toBe(0)
    await expect(readFile(mappedPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(protectedPath, 'utf8')).toBe('protected')
  })

  it('leaves runtime byte-for-byte unchanged when confirmation is declined', async () => {
    sandbox = new SandboxEnvironment()
    const directory = await sandbox.create()
    const runtime = path.join(directory, 'codex')
    await mkdir(path.join(runtime, 'sessions'), { recursive: true })
    await writeFile(path.join(runtime, 'sessions', 'thread.jsonl'), 'history')

    const result = await runCliErase(sandbox, directory, ['--target', 'codex'], { CODEX_HOME: runtime }, 'n\n')

    expect(result.exitCode).toBe(0)
    expect(await readFile(path.join(runtime, 'sessions', 'thread.jsonl'), 'utf8')).toBe('history')
    expect(result.stdout).toMatch(/cancelled/i)
  })

  it('treats an aborted confirmation prompt as cancellation without mutation', async () => {
    sandbox = new SandboxEnvironment()
    const directory = await sandbox.create()
    const runtime = path.join(directory, 'claude-abort')
    await mkdir(path.join(runtime, 'projects'), { recursive: true })
    const history = path.join(runtime, 'projects', 'session.jsonl')
    await writeFile(history, 'history')

    const result = await runCliErase(sandbox, directory, ['--target', 'claude-code'], { CLAUDE_CONFIG_DIR: runtime }, '')

    expect(result.exitCode).toBe(0)
    expect(await readFile(history, 'utf8')).toBe('history')
    expect(result.stdout).toMatch(/cancelled/i)
  })

  it('rejects a symlinked runtime root without deleting external protected history', async () => {
    sandbox = new SandboxEnvironment()
    const directory = await sandbox.create()
    const external = path.join(directory, 'protected-runtime')
    const linkedRoot = path.join(directory, 'claude-link')
    const protectedFile = path.join(external, 'projects', 'protected.jsonl')
    await mkdir(path.dirname(protectedFile), { recursive: true })
    await writeFile(protectedFile, 'protected')
    await symlink(external, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir')

    const result = await runCliErase(sandbox, directory, ['--target', 'claude-code'], { CLAUDE_CONFIG_DIR: linkedRoot }, 'y\n')

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toMatch(/symbolic link|symlink/i)
    expect(await readFile(protectedFile, 'utf8')).toBe('protected')
  })

  it('shows preservation boundaries in erase help', async () => {
    sandbox = new SandboxEnvironment()
    const directory = await sandbox.create()
    const result = await runCliErase(sandbox, directory, ['--help'], {}, '')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toMatch(/Claude Code.*Codex.*Copilot.*Antigravity.*OpenCode/s)
    expect(result.stdout).toMatch(/credentials.*configuration.*extensions/is)
  })
})
