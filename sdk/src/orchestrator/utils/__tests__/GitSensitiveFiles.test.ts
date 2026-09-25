import { describe, it, expect } from 'vitest'
import { findSensitiveGitPaths } from '../GitSensitiveFiles'

describe('findSensitiveGitPaths', () => {
  it('flags staged credentials while allowing ordinary source files', () => {
    expect(findSensitiveGitPaths(['src/index.ts', '.env.local', 'config/service-account.json', 'id_ed25519']))
      .toEqual(['.env.local', 'config/service-account.json', 'id_ed25519'])
  })
})
