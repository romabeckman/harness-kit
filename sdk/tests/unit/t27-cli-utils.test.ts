import { describe, it, expect, vi } from 'vitest'
import { printVersion, expandPath, resolveDirs, validateDirs, validateScope } from '../../src/cli/utils/cli-utils'
import { homedir } from 'node:os'
import { join } from 'node:path'

describe('cli-utils', () => {
  it('printVersion outputs package version', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printVersion()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringMatching(/@romabeckman\/hrns v/))
    consoleSpy.mockRestore()
  })

  describe('expandPath', () => {
    it('expands ~ to home dir', () => {
      expect(expandPath('~')).toBe(homedir())
    })

    it('expands ~/subpath correctly', () => {
      expect(expandPath('~/my-folder')).toBe(join(homedir(), 'my-folder'))
    })

    it('returns absolute paths as is', () => {
      expect(expandPath('/usr/bin')).toBe('/usr/bin')
    })
  })

  describe('resolveDirs', () => {
    it('splits comma-separated directory list and expands them', () => {
      const dirs = resolveDirs('~, /usr/local')
      expect(dirs).toEqual([homedir(), '/usr/local'])
    })
  })

  describe('validateDirs', () => {
    it('returns error string when paths list is empty', () => {
      expect(validateDirs('   ')).toBe('At least one path is required.')
    })

    it('validates existing directory', () => {
      expect(validateDirs(homedir())).toBe(true)
    })

    it('returns error string if path does not exist', () => {
      expect(validateDirs('/non/existing/path/xyz123')).toContain('Path does not exist:')
    })
  })

  describe('validateScope', () => {
    it('rejects empty scope', () => {
      expect(validateScope('')).toContain('Scope cannot be empty')
    })

    it('rejects scope shorter than 20 characters', () => {
      expect(validateScope('short scope')).toContain('Scope is too short')
    })

    it('accepts detailed scope >= 20 characters', () => {
      expect(validateScope('This is a detailed scope description for the project')).toBe(true)
    })
  })
})
