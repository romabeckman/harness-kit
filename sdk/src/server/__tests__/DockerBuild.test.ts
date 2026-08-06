import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

describe('Docker Build & Compose Setup', () => {
  const rootDir = join(__dirname, '../../..')
  const dockerfilePath = join(rootDir, 'Dockerfile')
  const composePath = join(rootDir, 'docker-compose.yml')

  it('FT-3.3.3: Verifies Dockerfile and docker-compose.yml exist, contain valid node image, HEALTHCHECK, EXPOSE 3000, and correct volume mount', () => {
    expect(existsSync(dockerfilePath)).toBe(true)
    expect(existsSync(composePath)).toBe(true)

    const dockerfileContent = readFileSync(dockerfilePath, 'utf-8')
    expect(dockerfileContent).toContain('FROM node:22-alpine AS builder')
    expect(dockerfileContent).toContain('FROM node:22-alpine AS runner')
    expect(dockerfileContent).toContain('EXPOSE 3000')
    expect(dockerfileContent).toContain('HEALTHCHECK')
    expect(dockerfileContent).toContain('http://localhost:3000/health')
    expect(dockerfileContent).toContain('CMD ["node", "dist/server/index.js"]')

    const composeContent = readFileSync(composePath, 'utf-8')
    expect(composeContent).toContain('hrns-server')
    expect(composeContent).toContain('build: .')
    expect(composeContent).toContain('3000:3000')
    expect(composeContent).toContain('.:/workspace')
    expect(composeContent).toContain('PORT=3000')
    expect(composeContent).toContain('HOST=0.0.0.0')
  })
})
